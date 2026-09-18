// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * GuideContextBridge.jsx — Guide Context Acquisition Bridge
 * ==========================================================
 * Shown when a user clicks "Start Guided Mode" from the manual but has no
 * work order selected.  Instead of a "Cannot Start" dead end, this bridge:
 *
 *   1. Navigates the app to /jobs, auto-filters to Open status
 *   2. Checks if any Open WOs exist — if none, offers to create a demo WO
 *   3. Renders a fixed right-side panel explaining what to do
 *   4. Polls window.__trierGuideContext.selectedWorkOrder every 500ms
 *   5. When a valid WO is selected → closes itself → starts the guide
 *
 * Demo WO flow (no Open WOs in plant):
 *   - Bridge creates a '[GUIDE DEMO]' work order via POST /api/work-orders
 *   - Dispatches trier-guide-open-wo to auto-load it in WorkOrdersView
 *   - Stores the ID in window.__trierGuideContext.guideDemoWorkOrderId
 *   - GuidedExecution discards it via DELETE /:id/guide-demo-discard on completion
 *
 * The guide engine (GuidedExecution.jsx) is untouched.  This component is
 * purely a context acquisition layer — it never starts the guide directly,
 * it only fires window.startTrierGuide(workflowId) once context is proven.
 *
 * Design invariants:
 *   - Never blocks the main content area — rendered via portal, right-docked
 *   - Only triggers on strict context: selectedWorkOrder.ID != null
 *   - User can dismiss at any time via X or Cancel
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ArrowLeft, Plus } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import MANUAL_SECTIONS from '../data/manualSections';

function isCorpPlant(plantId) {
    return !plantId || plantId === 'all_sites';
}

export default function GuideContextBridge({ workflowId, sectionId, onClose }) {
    const { t }    = useTranslation();
    const navigate = useNavigate();
    const intervalRef = useRef(null);

    const section = MANUAL_SECTIONS[sectionId] || {};

    const [corpView,      setCorpView]      = useState(() => isCorpPlant(localStorage.getItem('selectedPlantId')));
    const [hasOpenWOs,    setHasOpenWOs]    = useState(null);   // null=checking, true=found, false=none
    const [creatingDemo,  setCreatingDemo]  = useState(false);

    // Navigate to Jobs and auto-filter to Open status
    useEffect(() => {
        navigate('/jobs');
        window.dispatchEvent(new CustomEvent('trier-guide-filter-jobs', { detail: { status: '20' } }));
    }, [navigate]);

    // Check for Open WOs once corp view is resolved
    useEffect(() => {
        if (corpView) return;
        const plantId = localStorage.getItem('selectedPlantId');
        if (!plantId) return;

        fetch('/api/work-orders?status=20&limit=1&page=1', {
            headers: { 'x-plant-id': plantId },
        })
            .then(r => r.json())
            .then(data => {
                const total = data?.meta?.total ?? data?.total ?? (Array.isArray(data) ? data.length : 0);
                setHasOpenWOs(total > 0);
            })
            .catch(() => setHasOpenWOs(true)); // On error, default to showing normal instruction
    }, [corpView]);

    // Poll every 500ms — check plant context first, then WO selection
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            const plantId = localStorage.getItem('selectedPlantId');
            const isCorp  = isCorpPlant(plantId);
            setCorpView(isCorp);

            // Don't attempt WO detection while in Corporate view — clicking View
            // there produces "Work order not found" because no plant DB is scoped.
            if (isCorp) return;

            const g  = window.__trierGuideContext || {};
            const wo = g.selectedWorkOrder ?? null;

            // Bridge only checks that a WO was selected — the engine's eligibility
            // gate (workOrderNotClosed) handles status validation and blocks with
            // a clear message if the user chose a Completed or Closed WO.
            const workOrderId = wo?.ID ?? wo?.ID_INTERNAL ?? null;

            if (workOrderId != null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                onClose();
                if (typeof window.startTrierGuide === 'function') {
                    window.startTrierGuide(workflowId);
                }
            }
        }, 500);
        return () => {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [workflowId, onClose]);

    async function handleCreateDemo() {
        const plantId = localStorage.getItem('selectedPlantId');
        if (!plantId) return;
        setCreatingDemo(true);
        try {
            // Work.ID is not auto-increment — fetch the next available ID first
            const idRes  = await fetch('/api/work-orders/next-id', { headers: { 'x-plant-id': plantId } });
            const idData = await idRes.json();
            const nextID = idData?.nextID;
            if (!nextID) { setCreatingDemo(false); return; }

            const res = await fetch('/api/work-orders', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    ID:          nextID,
                    Description: '[GUIDE DEMO] Close-Out Walk-through',
                    StatusID:    20,
                    Priority:    '3',
                    AddDate:     new Date().toISOString().slice(0, 10),
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.id) {
                setCreatingDemo(false);
                return;
            }
            // Store ID for cleanup after guide completes
            window.__trierGuideContext = window.__trierGuideContext || {};
            window.__trierGuideContext.guideDemoWorkOrderId = data.id;

            // Auto-open the new demo WO in WorkOrdersView — triggers selectedWorkOrder publish
            window.dispatchEvent(new CustomEvent('trier-guide-open-wo', { detail: { id: data.id } }));
        } catch {
            setCreatingDemo(false);
        }
    }

    const panelStyle = {
        position:   'fixed',
        right:      0,
        top:        0,
        bottom:     0,
        width:      '300px',
        background: 'rgba(15, 23, 42, 0.98)',
        borderLeft: '1px solid rgba(245, 158, 11, 0.3)',
        zIndex:     99989,
        display:    'flex',
        flexDirection: 'column',
        color:      '#f1f5f9',
        boxShadow:  '-8px 0 32px rgba(0,0,0,0.5)',
    };

    const headerColor = corpView ? '#f87171' : '#fbbf24';
    const headerLabel = corpView
        ? t('guide.bridge.selectLocationFirst', 'Select a location to continue')
        : hasOpenWOs === false
            ? t('guide.bridge.noOpenWOs', 'No open work orders found')
            : t('guide.bridge.selectToBegin', 'Select a work order to begin');

    const panel = (
        <div style={panelStyle} data-testid="guide-context-bridge">

            {/* Instruction strip */}
            <div style={{
                padding:      '14px 16px',
                background:   corpView ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                borderBottom: corpView ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '10px',
            }}>
                <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: headerColor, lineHeight: '1.4',
                }}>
                    {headerLabel}
                </span>
                <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
                    title={t('guide.bridge.cancel', 'Cancel guided mode')}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Section info — minimal, directional */}
            <div style={{ padding: '20px 18px', flex: 1, overflowY: 'auto' }}>
                <p style={{
                    margin: '0 0 6px',
                    fontSize: '0.68rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: '#f59e0b',
                }}>
                    {t('guide.bridge.guidedWorkflow', 'Guided Workflow')}
                </p>
                <h3 style={{ margin: '0 0 10px', fontSize: '1rem', fontWeight: 700, color: '#f1f5f9', lineHeight: '1.35' }}>
                    {section.displayTitle || t('guide.bridge.defaultTitle', 'Guided Workflow')}
                </h3>
                <p style={{ margin: '0 0 20px', fontSize: '0.82rem', lineHeight: '1.55', color: '#94a3b8' }}>
                    {section.displayIntro || ''}
                </p>

                {/* Corp-view warning */}
                {corpView ? (
                    <div style={{
                        padding:      '14px',
                        background:   'rgba(239, 68, 68, 0.08)',
                        border:       '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        lineHeight:   '1.55',
                    }}>
                        <p style={{ margin: '0 0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#f87171' }}>
                            {t('guide.bridge.corpViewTitle', 'You need to select a location first')}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#fca5a5' }}>
                            {t('guide.bridge.corpViewBody', 'Use the "Select Plant Location" dropdown at the top of the page to choose your facility. Once you select a location, come back and click View on a work order.')}
                        </p>
                    </div>

                ) : hasOpenWOs === false ? (
                    /* No Open WOs — offer demo creation */
                    <div>
                        <div style={{
                            padding:      '14px',
                            background:   'rgba(245, 158, 11, 0.07)',
                            border:       '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '8px',
                            fontSize:     '0.82rem',
                            color:        '#fcd34d',
                            lineHeight:   '1.55',
                            marginBottom: '12px',
                        }}>
                            {t('guide.bridge.noOpenWOsBody', 'This plant has no open work orders. Create a demo work order to walk through the guided flow — it will be discarded when the guide completes.')}
                        </div>
                        <button
                            onClick={handleCreateDemo}
                            disabled={creatingDemo}
                            style={{
                                width: '100%', padding: '10px',
                                background: creatingDemo ? 'rgba(245,158,11,0.05)' : 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                borderRadius: '7px',
                                color: creatingDemo ? '#78716c' : '#fbbf24',
                                cursor: creatingDemo ? 'default' : 'pointer',
                                fontSize: '0.82rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                            }}
                        >
                            <Plus size={14} />
                            {creatingDemo
                                ? t('guide.bridge.creating', 'Creating…')
                                : t('guide.bridge.createDemo', 'Create Demo Work Order')
                            }
                        </button>
                    </div>

                ) : (
                    /* Normal instruction — arrow points left toward the list */
                    <>
                        <div style={{
                            padding:      '12px 14px',
                            background:   'rgba(245, 158, 11, 0.07)',
                            border:       '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: '8px',
                            fontSize:     '0.84rem',
                            color:        '#fcd34d',
                            lineHeight:   '1.55',
                            display:      'flex',
                            alignItems:   'flex-start',
                            gap:          '8px',
                        }}>
                            <span style={{ fontSize: '1.1rem', lineHeight: '1.3', flexShrink: 0 }}>←</span>
                            <span>{t('guide.bridge.instruction', 'Find a work order showing Open in the STATUS column and click its blue View button.')}</span>
                        </div>

                        <div style={{
                            marginTop:    '8px',
                            padding:      '9px 12px',
                            background:   'rgba(239, 68, 68, 0.06)',
                            border:       '1px solid rgba(239, 68, 68, 0.18)',
                            borderRadius: '7px',
                            fontSize:     '0.77rem',
                            color:        '#fca5a5',
                            lineHeight:   '1.45',
                            display:      'flex',
                            alignItems:   'center',
                            gap:          '7px',
                        }}>
                            <span style={{ flexShrink: 0 }}>✕</span>
                            <span>{t('guide.bridge.notNewWO', 'Do not click + New WO — that creates a new record.')}</span>
                        </div>
                    </>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                    onClick={() => {
                        onClose();
                        const anchor = section.sectionAnchor ? `#${section.sectionAnchor}` : '';
                        navigate(`/about?manual=true${anchor}`);
                    }}
                    style={{
                        width: '100%', padding: '8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: '6px',
                        color: '#f87171', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}
                >
                    <ArrowLeft size={13} />
                    {t('guide.bridge.backToManual', 'Back to Manual')}
                </button>
                <button
                    onClick={onClose}
                    style={{
                        width: '100%', padding: '6px',
                        background: 'none', border: 'none',
                        color: '#475569', cursor: 'pointer', fontSize: '0.73rem',
                    }}
                >
                    {t('guide.bridge.cancelGuide', 'Cancel Guided Mode')}
                </button>
            </div>
        </div>
    );

    return createPortal(panel, document.body);
}
