// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — AI SOP Generator
 * =============================
 * AI-assisted Standard Operating Procedure authoring tool. Users select an
 * asset type and procedure category; the engine assembles a structured SOP
 * with safety checks, step-by-step instructions, and required parts/tools.
 *
 * WORKFLOW:
 *   1. Select asset type (Compressor, Conveyor, HVAC, etc.)
 *   2. Select procedure type (PM, Repair, Inspection, Calibration, LOTO)
 *   3. AI generates structured SOP template with customizable sections
 *   4. User edits steps, adds warnings, attaches reference images
 *   5. Save to Procedures library — immediately available on work orders
 *
 * KEY FEATURES:
 *   - Asset type selector with 15+ equipment categories
 *   - Procedure type picker: PM / Repair / Inspection / Calibration / LOTO
 *   - Editable step builder: add, reorder, delete steps inline
 *   - Safety warning inserter: DANGER / WARNING / CAUTION / NOTE callouts
 *   - Parts & tools list auto-populated from asset BOM
 *   - Save as draft or publish directly to Procedures library
 *   - Upload existing PDF/Word SOPs for AI parsing and reformatting
 *
 * API CALLS:
 *   POST /api/procedures/ai-generate   — Generate SOP template from parameters
 *   POST /api/procedures               — Save finalized SOP to library
 */
import React, { useState, useRef } from 'react';
import { Bot, Upload, FileText, Wand2, Save, X, AlertTriangle, ChevronRight, Trash2, Plus, Settings, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const ASSET_TYPES = [
    'Air Compressor', 'Boiler', 'Centrifugal Pump', 'Chiller', 'Compressor',
    'Conveyor', 'Cooling Tower', 'Electrical Panel', 'Filling Machine', 'HVAC',
    'Motor', 'Pasteurizer', 'Separator', 'Steam Valve', 'Tank', 'Other'
];

const PROCEDURE_TYPES = [
    'Preventative Maintenance', 'Corrective Maintenance', 'Inspection',
    'Calibration', 'Lubrication', 'Safety Check', 'Overhaul', 'Cleaning'
];

export default function AISopGenerator({ plantId, onClose, onSaved }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('upload'); // upload | configure | generating | review
    const [sourceText, setSourceText] = useState('');
    const [assetType, setAssetType] = useState('Other');
    const [procedureType, setProcedureType] = useState('Preventative Maintenance');
    const [generatedSOP, setGeneratedSOP] = useState(null);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [sopId, setSopId] = useState('');
    const [editedSOP, setEditedSOP] = useState(null);
    const fileRef = useRef(null);
    const [pdfProcessing, setPdfProcessing] = useState(false);

    const headers = {
        'Content-Type': 'application/json',
        'x-plant-id': plantId
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (['txt', 'md'].includes(ext)) {
            // Plain text — read directly
            const text = await file.text();
            setSourceText(text);
        } else if (['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp'].includes(ext)) {
            // PDF or image — send to backend for extraction
            setPdfProcessing(true);
            setError('');
            try {
                const formData = new FormData();
                formData.append('file', file);
                const res = await fetch('/api/procedures/extract-text', {
                    method: 'POST',
                    headers: {
                        'x-plant-id': plantId
                    },
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Extraction failed');
                setSourceText(data.text || '');
                setError('');
            } catch (err) {
                setError(`Failed to extract text from ${file.name}: ${err.message}`);
            }
            setPdfProcessing(false);
        } else {
            setError(t('a.i.sop.generator.unsupportedFileType', 'Unsupported file type. Supported: .txt, .md, .pdf, .png, .jpg'));
        }
    };

    const handleGenerate = async () => {
        if (sourceText.trim().length < 20) {
            setError(t('a.i.sop.generator.minCharsError', 'Please provide at least 20 characters of equipment documentation.'));
            return;
        }
        setError('');
        setStep('generating');
        try {
            const res = await fetch('/api/procedures/ai-generate', {
                method: 'POST', headers,
                body: JSON.stringify({ text: sourceText, assetType, procedureType })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'AI generation failed');
            setGeneratedSOP(data.sop);
            setEditedSOP(JSON.parse(JSON.stringify(data.sop)));
            setSopId(`AI-${Date.now().toString(36).toUpperCase()}`);
            setStep('review');
        } catch (err) {
            setError(err.message);
            setStep('configure');
        }
    };

    const handleSave = async () => {
        if (!sopId.trim()) { setError(t('a.i.sop.generator.procedureIdRequired', 'Procedure ID is required')); return; }
        setIsSaving(true);
        setError('');
        try {
            const sop = editedSOP;
            const payload = {
                ID: sopId,
                Description: sop.title || 'AI-Generated SOP',
                RevNum: 1,
                Author: localStorage.getItem('currentUser') || 'AI Generator',
                Tasks: (sop.steps || []).map(s => ({
                    Description: s.title,
                    Instructions: s.instructions
                }))
            };
            const res = await fetch('/api/procedures', {
                method: 'POST', headers,
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Save failed');
            }
            if (onSaved) onSaved();
            onClose();
        } catch (err) {
            setError(err.message);
        }
        setIsSaving(false);
    };

    const updateStep = (idx, field, value) => {
        const newSop = { ...editedSOP };
        newSop.steps = [...newSop.steps];
        newSop.steps[idx] = { ...newSop.steps[idx], [field]: value };
        setEditedSOP(newSop);
    };

    const removeStep = (idx) => {
        const newSop = { ...editedSOP };
        newSop.steps = newSop.steps.filter((_, i) => i !== idx);
        newSop.steps.forEach((s, i) => s.order = i + 1);
        setEditedSOP(newSop);
    };

    const addStep = () => {
        const newSop = { ...editedSOP };
        newSop.steps = [...(newSop.steps || []), { order: (newSop.steps?.length || 0) + 1, title: '', instructions: '' }];
        setEditedSOP(newSop);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card" style={{
                border: '1px solid #8b5cf6', width: '95vw', maxWidth: '1000px', height: '90vh',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    padding: '15px 25px', borderBottom: '1px solid var(--glass-border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.05))'
                }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, color: '#8b5cf6', fontSize: '1.2rem' }}>
                        <Bot size={24} /> {t('a.i.sop.generator.aiSopGenerator')}
                    </h2>
                    {/* Step Indicator */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {[
                            { key: 'upload', label: t('a.i.sop.generator.stepUpload', 'Upload') },
                            { key: 'configure', label: t('a.i.sop.generator.stepConfigure', 'Configure') },
                            { key: 'review', label: t('a.i.sop.generator.stepReview', 'Review') }
                        ].map(({ key, label }, i) => {
                            const STEP_ORDER = ['upload', 'configure', 'review'];
                            const current = step === 'generating' ? 'configure' : step;
                            const isActive = key === current;
                            const isDone = i < STEP_ORDER.indexOf(current);
                            return (
                                <React.Fragment key={key}>
                                    {i > 0 && <ChevronRight size={14} color="var(--text-muted)" />}
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '14px', fontSize: '0.75rem', fontWeight: 600,
                                        background: isActive ? 'rgba(139,92,246,0.2)' : isDone ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                                        color: isActive ? '#8b5cf6' : isDone ? '#10b981' : 'var(--text-muted)',
                                        border: `1px solid ${isActive ? '#8b5cf644' : isDone ? '#10b98133' : 'transparent'}`
                                    }}>
                                        {isDone ? '✓ ' : ''}{label}
                                    </span>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <button onClick={onClose} title={t('aiSop.closeTheAiSopGeneratorTip')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={22} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '25px' }}>
                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '10px', padding: '12px 16px', marginBottom: '15px',
                            display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontSize: '0.85rem'
                        }}>
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    {/* STEP 1: Upload */}
                    {step === 'upload' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <Bot size={48} color="#8b5cf6" style={{ marginBottom: '12px' }} />
                                <h3 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '1.3rem' }}>{t('a.i.sop.generator.uploadEquipmentDocumentation')}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                                    {t('a.i.sop.generator.uploadDescription', 'Upload a PDF manual, paste text, or upload an image. The AI will extract procedures automatically.')}
                                </p>
                            </div>

                            {/* Upload zone */}
                            <div onClick={() => !pdfProcessing && fileRef.current?.click()} style={{
                                border: '2px dashed rgba(139,92,246,0.3)', borderRadius: '14px', padding: '30px',
                                textAlign: 'center', cursor: pdfProcessing ? 'wait' : 'pointer', background: 'rgba(139,92,246,0.03)',
                                transition: 'all 0.3s', position: 'relative', opacity: pdfProcessing ? 0.7 : 1
                            }}>
                                {pdfProcessing ? (
                                    <>
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            border: '4px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6',
                                            animation: 'spin 1s linear infinite', margin: '0 auto 10px'
                                        }} />
                                        <p style={{ color: '#8b5cf6', fontWeight: 600, margin: '0 0 4px 0' }}>{t('a.i.sop.generator.extractingText', 'Extracting text from document...')}</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>{t('a.i.sop.generator.largeDocsMayTakeMoment', 'This may take a moment for large PDFs')}</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} color="#8b5cf6" style={{ marginBottom: '10px' }} />
                                        <p style={{ color: '#8b5cf6', fontWeight: 600, margin: '0 0 4px 0' }}>{t('a.i.sop.generator.clickToUploadFile', 'Click to Upload File')}</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>{t('a.i.sop.generator.uploadFileTypes', '.pdf, .txt, .md, or images (.png, .jpg)')}</p>
                                    </>
                                )}
                                <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp" onChange={handleFileUpload} style={{ display: 'none' }} title={t('aiSop.selectAFileToUploadTip')} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('a.i.sop.generator.orPasteTextBelow')}</span>
                                <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }} />
                            </div>

                            <textarea
                                rows={12}
                                placeholder={t('a.i.sop.generator.pasteEquipmentManualContent')}
                                value={sourceText}
                                onChange={e => setSourceText(e.target.value)}
                                style={{
                                    width: '100%', background: 'rgba(0,0,0,0.3)', color: '#fff',
                                    border: '1px solid var(--glass-border)', borderRadius: '10px',
                                    padding: '15px', fontSize: '0.9rem', lineHeight: 1.6, resize: 'vertical',
                                    fontFamily: 'monospace'
                                }}
                                title={t('aiSop.pasteEquipmentManualTextOrTip')}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    <FileText size={12} style={{ marginRight: '4px' }} />{sourceText.length.toLocaleString()} characters
                                </span>
                                <button                                     className="btn-primary"
                                    disabled={sourceText.trim().length < 20}
                                    onClick={() => setStep('configure')}
                                    style={{
                                        padding: '10px 28px', fontSize: '0.9rem', fontWeight: 600,
                                        background: sourceText.trim().length >= 20 ? '#8b5cf6' : 'var(--glass-border)',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                    title={t('aiSop.proceedToConfigureAiGenerationTip')}
                                >
                                    {t('a.i.sop.generator.nextConfigure')} <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Configure */}
                    {(step === 'configure' || step === 'generating') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ textAlign: 'center', padding: '15px 0' }}>
                                <Settings size={40} color="#8b5cf6" style={{ marginBottom: '8px' }} />
                                <h3 style={{ color: '#fff', margin: '0 0 6px 0' }}>{t('a.i.sop.generator.configureGeneration')}</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                                    {t('a.i.sop.generator.selectTheEquipmentType')}
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '600px', margin: '0 auto' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('a.i.sop.generator.equipmentAssetType')}</label>
                                    <select value={assetType} onChange={e => setAssetType(e.target.value)} style={{ width: '100%' }} title={t('aiSop.selectTheTypeOfEquipmentTip')}>
                                        {ASSET_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('a.i.sop.generator.procedureType')}</label>
                                    <select value={procedureType} onChange={e => setProcedureType(e.target.value)} style={{ width: '100%' }} title={t('aiSop.selectTheMaintenanceProcedureCategoryTip')}>
                                        {PROCEDURE_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{
                                background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)',
                                borderRadius: '10px', padding: '15px', maxWidth: '600px', margin: '0 auto'
                            }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <strong style={{ color: '#8b5cf6' }}>{t('a.i.sop.generator.sourceText', '📄 Source Text:')}</strong> {sourceText.length.toLocaleString()} characters
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                    "{sourceText.substring(0, 120)}..."
                                </div>
                            </div>

                            {step === 'generating' ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <div style={{
                                        width: '60px', height: '60px', borderRadius: '50%',
                                        border: '4px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6',
                                        animation: 'spin 1s linear infinite', margin: '0 auto 15px'
                                    }} />
                                    <p style={{ color: '#8b5cf6', fontWeight: 600, fontSize: '1rem' }}>{t('a.i.sop.generator.aiIsAnalyzingYour')}</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('a.i.sop.generator.thisMayTake1030')}</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', paddingTop: '10px' }}>
                                    <button className="btn-nav" onClick={() => setStep('upload')} style={{ padding: '10px 20px' }} title={t('aiSop.goBackToModifyTheTip')}>
                                        {t('a.i.sop.generator.back', '← Back')}
                                    </button>
                                    <button
                                        className="btn-primary"
                                        onClick={handleGenerate}
                                        style={{
                                            padding: '12px 32px', fontSize: '1rem', fontWeight: 700,
                                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                            boxShadow: '0 0 25px rgba(139,92,246,0.3)',
                                            display: 'flex', alignItems: 'center', gap: '10px'
                                        }}
                                        title={t('aiSop.runTheAiEngineToTip')}
                                    >
                                        <Wand2 size={20} /> {t('a.i.sop.generator.generateSop')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 3: Review */}
                    {step === 'review' && editedSOP && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* Generated SOP Header */}
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(139,92,246,0.05))',
                                border: '1px solid rgba(16,185,129,0.2)', borderRadius: '12px', padding: '18px',
                                display: 'flex', alignItems: 'center', gap: '12px'
                            }}>
                                <CheckCircle2 size={24} color="#10b981" />
                                <div>
                                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1rem' }}>{t('a.i.sop.generator.sopGeneratedSuccessfully')}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        {editedSOP.steps?.length || 0} steps, {editedSOP.tools?.length || 0} tools, {editedSOP.warnings?.length || 0} safety warnings
                                    </div>
                                </div>
                            </div>

                            {/* ID + Title */}
                            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('a.i.sop.generator.procedureId')}</label>
                                    <input type="text" value={sopId} onChange={e => setSopId(e.target.value)} style={{ width: '100%' }} title={t('aiSop.uniqueIdentifierForThisProcedureTip')} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('a.i.sop.generator.title')}</label>
                                    <input
                                        type="text" value={editedSOP.title || ''}
                                        onChange={e => setEditedSOP({ ...editedSOP, title: e.target.value })}
                                        style={{ width: '100%', fontWeight: 600 }}
                                        title={t('aiSop.descriptiveTitleForThisSopTip')}
                                    />
                                </div>
                            </div>

                            {/* Meta row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '10px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('a.i.sop.generator.estimatedTime')}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{editedSOP.estimatedTime || '--'}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '10px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('a.i.sop.generator.frequency')}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{editedSOP.frequency || '--'}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '10px', border: '1px solid var(--glass-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('a.i.sop.generator.type')}</div>
                                    <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{editedSOP.procedureType || procedureType}</div>
                                </div>
                            </div>

                            {/* Warnings */}
                            {editedSOP.warnings?.length > 0 && (
                                <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>{t('a.i.sop.generator.safetyWarnings', '⚠️ Safety Warnings')}</div>
                                    {editedSOP.warnings.map((w, i) => (
                                        <div key={i} style={{ fontSize: '0.8rem', color: '#fbbf24', padding: '2px 0' }}>• {w}</div>
                                    ))}
                                </div>
                            )}

                            {/* Steps */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>{t('a.i.sop.generator.procedureSteps')}</h3>
                                    <button className="btn-primary" onClick={addStep} title={t('aiSop.addANewProceduralStepTip')} style={{ padding: '6px 14px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Plus size={14} /> {t('a.i.sop.generator.addStep')}
                                    </button>
                                </div>
                                {(editedSOP.steps || []).map((s, i) => (
                                    <div key={i} style={{
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
                                        borderRadius: '10px', padding: '14px', marginBottom: '10px'
                                    }}>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{
                                                background: '#8b5cf6', color: '#fff', width: '26px', height: '26px',
                                                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.75rem', fontWeight: 700, flexShrink: 0
                                            }}>{i + 1}</span>
                                            <input
                                                type="text" value={s.title}
                                                onChange={e => updateStep(i, 'title', e.target.value)}
                                                style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}
                                                placeholder={t('a.i.sop.generator.stepTitle')}
                                                title={t('aiSop.briefTitleForThisStepTip')}
                                            />
                                            <button onClick={() => removeStep(i)} title={t('aiSop.removeThisStepTip')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <textarea
                                            rows={3} value={s.instructions}
                                            onChange={e => updateStep(i, 'instructions', e.target.value)}
                                            placeholder={t('a.i.sop.generator.detailedInstructions')}
                                            style={{
                                                width: '100%', background: 'rgba(0,0,0,0.2)', color: '#fff',
                                                border: '1px solid var(--glass-border)', borderRadius: '6px',
                                                padding: '10px', fontSize: '0.8rem', lineHeight: 1.5, resize: 'vertical'
                                            }}
                                            title={t('aiSop.detailedStepInstructionsTip')}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Tools & Parts */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '14px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1', marginBottom: '8px' }}>{t('a.i.sop.generator.requiredTools', '🔧 Required Tools')}</div>
                                    {(editedSOP.tools || []).map((tool, i) => (
                                        <div key={i} style={{ fontSize: '0.8rem', color: '#fff', padding: '2px 0' }}>• {tool}</div>
                                    ))}
                                    {(!editedSOP.tools || editedSOP.tools.length === 0) && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('a.i.sop.generator.noneSpecified')}</div>
                                    )}
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '14px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981', marginBottom: '8px' }}>{t('a.i.sop.generator.requiredParts', '📦 Required Parts')}</div>
                                    {(editedSOP.parts || []).map((p, i) => (
                                        <div key={i} style={{ fontSize: '0.8rem', color: '#fff', padding: '2px 0' }}>• {p.name} (Qty: {p.quantity})</div>
                                    ))}
                                    {(!editedSOP.parts || editedSOP.parts.length === 0) && (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('a.i.sop.generator.noneSpecified')}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'review' && (
                    <div style={{
                        padding: '15px 25px', borderTop: '1px solid var(--glass-border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'rgba(0,0,0,0.2)'
                    }}>
                        <button className="btn-nav" onClick={() => setStep('configure')} title={t('aiSop.goBackAndRegenerateWithTip')} style={{ padding: '10px 20px' }}>
                            {t('a.i.sop.generator.reGenerate', '← Re-Generate')}
                        </button>
                        <button
                            className="btn-primary"
                            onClick={handleSave}
                            disabled={isSaving}
                            style={{
                                padding: '12px 32px', fontSize: '1rem', fontWeight: 700,
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                boxShadow: '0 0 20px rgba(16,185,129,0.3)',
                                display: 'flex', alignItems: 'center', gap: '10px'
                            }}
                            title={t('aiSop.saveThisAigeneratedSopToTip')}
                        >
                            <Save size={18} /> {isSaving ? t('a.i.sop.generator.saving', 'Saving...') : t('a.i.sop.generator.saveToSopLibrary', 'Save to SOP Library')}
                        </button>
                    </div>
                )}

                <style>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </div>
        </div>
    );
}
