// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Procedures & SOP Management
 * ========================================
 * Standard Operating Procedure (SOP) library and editor. Maintains the
 * complete catalog of maintenance procedures with step editors, parts/tools
 * requirements, safety precautions, and AI-assisted authoring.
 *
 * KEY FEATURES:
 *   - Procedure library: searchable, filterable by category (PM/Repair/Inspection)
 *   - Step editor: ordered step list with drag-to-reorder and rich text body
 *   - Parts & tools: specify required parts (with BOM link) and tools per procedure
 *   - Safety block: PPE requirements, hazards, lock-out requirements per SOP
 *   - AI generation: AISopGenerator creates structured first drafts from asset type
 *   - Versioning: each save creates a new version; prior versions viewable as history
 *   - Approval workflow: draft → review → approved; published SOPs can be linked to WOs
 *   - Attach to Work Orders: link procedures directly to WO templates for consistent execution
 *   - Print SOP: formatted field-ready procedure card for technicians without devices
 *
 * API CALLS:
 *   GET    /api/procedures              — SOP library (plant-scoped)
 *   POST   /api/procedures              — Create new procedure
 *   PUT    /api/procedures/:id          — Update procedure / increment version
 *   DELETE /api/procedures/:id          — Delete procedure
 *   GET    /api/procedures/:id/history  — Version history
 */
import React, { useState, useEffect } from 'react';
import { BookOpen, Map, Printer, Mail, Download, X, Eye, PenTool, Bot, Pencil } from 'lucide-react';
import ActionBar from './ActionBar';
import { TakeTourButton } from './ContextualTour';

const ActionBtn = ({ icon:Icon, tip, color='var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e=>{e.stopPropagation();onClick&&onClick();}} style={{ background:'none', border:'none', cursor:'pointer', color, padding:'4px 6px', borderRadius:6, transition:'all 0.15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>
        <Icon size={17}/>
    </button>
);
const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding:'10px 14px' }}>
        <strong style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</strong>
        <div style={{ fontSize:'0.95rem', marginTop:3 }}>{value || '—'}</div>
    </div>
);
import PushToTalkButton from './PushToTalkButton';
import AISopGenerator from './AISopGenerator';
import GenericAttachments from './GenericAttachments';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

export default function ProceduresDashboard({ plantId }) {
    const { t } = useTranslation();
    const [nestedTab, setNestedTab] = useState('sops');
    const [viewingProc, setViewingProc] = useState(null);
    const [procDetails, setProcDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState(null);
    const [editingTaskData, setEditingTaskData] = useState(null);
    const [viewingTask, setViewingTask] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showAIGenerator, setShowAIGenerator] = useState(false);

    const triggerRefresh = () => setRefreshKey(prev => prev + 1);

    const handleViewSOP = async (id, sourcePlant = null) => {
        setLoadingDetails(true);
        setViewingProc({ id, sourcePlant });
        setProcDetails(null);
        setIsEditing(false); // Reset editing state when switching SOPs
        try {
            const url = sourcePlant ? `/api/procedures/${id}?sourcePlant=${sourcePlant}` : `/api/procedures/${id}`;
            const res = await fetch(url, { headers: { 'x-plant-id': plantId } });
            const data = await res.json();
            setProcDetails(data);
        } catch (err) {
            console.error('Failed to load SOP details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handlePrint = async () => {
        if (procDetails) {
            window.triggerTrierPrint('sop', procDetails);
        } else {
            // New: Specialized Catalog Print
            try {
                const endpoint = nestedTab === 'tasks' ? '/api/procedures/tasks?limit=1000' : '/api/procedures?limit=1000';
                const res = await fetch(endpoint, { headers: { 'x-plant-id': plantId } });
                const json = await res.json();
                let items = [];
                if (Array.isArray(json?.data)) items = json.data;
                else if (Array.isArray(json)) items = json;
                
                window.triggerTrierPrint('catalog-internal', { type: nestedTab, items });
            } catch (err) {
                console.error('Print Catalog Error:', err);
                window.print(); // Fallback if specialized print fails
            }
        }
    };

    const handleEmail = () => {
        if (!procDetails) return;
        const subject = `SOP: ${procDetails.ID} - ${procDetails.Description}`;
        let body = `STANDARD OPERATING PROCEDURE\n`;
        body += `===========================\n`;
        body += `ID: ${procDetails.ID}\n`;
        body += `Title: ${procDetails.Description}\n`;
        body += `Revision: ${procDetails.RevNum || 0}\n\n`;

        body += `INSTRUCTIONAL STEPS:\n`;
        if (procDetails._tasks?.length > 0) {
            procDetails._tasks.forEach(task => {
                body += `[Step ${task.TskOrder}] ${task.Description}\n`;
                body += `${task.Instructions || 'No specific instructions.'}\n\n`;
            });
        } else {
            body += `No steps defined.\n\n`;
        }

        body += `REQUIRED PARTS:\n`;
        if (procDetails._parts?.length > 0) {
            procDetails._parts.forEach(p => {
                body += `- ${p.ID}: ${p.Description} (Qty: ${p.EstQty})\n`;
            });
        } else {
            body += `No parts required.\n`;
        }

        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleEditStart = () => {
        setEditData({
            ...procDetails,
            _tasks: [...(procDetails._tasks || [])],
            _parts: [...(procDetails._parts || [])]
        });
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        try {
            const res = await fetch(`/api/procedures/${viewingProc.id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plant-id': plantId
                },
                body: JSON.stringify(editData)
            });
            if (res.ok) {
                setIsEditing(false);
                handleViewSOP(viewingProc.id, viewingProc.sourcePlant);
                triggerRefresh();
            } else {
                const err = await res.json();
                window.trierToast?.error(`Save failed: ${err.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error('Save error:', err);
            window.trierToast?.error('Error communicating with server');
        }
    };

    const handleSaveTaskMaster = async () => {
        if (!editingTaskData) return;
        try {
            const res = await fetch(`/api/procedures/tasks/${editingTaskData.ID}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-plant-id': plantId
                },
                body: JSON.stringify({
                    Description: editingTaskData.Description || editingTaskData.Descript,
                    Tasks: editingTaskData.Tasks || editingTaskData.Instructions,
                    TaskTypID: editingTaskData.TaskTypID
                })
            });
            if (res.ok) {
                setEditingTaskData(null);
                triggerRefresh();
            } else {
                window.trierToast?.error('Failed to save task master data');
            }
        } catch (err) {
            console.error('Task save error:', err);
        }
    };

    const handleDelete = async () => {
        if (!await confirm("Are you sure you want to delete this procedure? This action is permanent.")) return;
        try {
            const res = await fetch(`/api/procedures/${viewingProc.id}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });
            if (res.ok) {
                setViewingProc(null);
                triggerRefresh();
            } else {
                window.trierToast?.error('Delete failed');
            }
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    return (
        <React.Fragment>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>

                <div className={viewingProc ? 'no-print' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', flex: 1, overflow: 'hidden' }}>

                    <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                        <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <BookOpen size={24} /> {t('procedures.sopMethodsLibrary')}
                        </h2>

                        <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>

                        <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                            <button 
                                onClick={() => setNestedTab('sops')}
                                className={`btn-nav ${nestedTab === 'sops' ? 'active' : ''}`}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('procedures.browseStandardOperatingProceduresTip')}
                            >
                                <BookOpen size={16} /> {t('procedures.sopLibrary')}
                            </button>
                            <button 
                                onClick={() => setNestedTab('tasks')}
                                className={`btn-nav ${nestedTab === 'tasks' ? 'active' : ''}`}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        title={t('procedures.viewAllIndividualTaskMasterTip')}
                            >
                                <Map size={16} /> {t('procedures.viewAllTaskData')}
                            </button>
                        </div>

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                            <TakeTourButton tourId="procedures" nestedTab={nestedTab} />
                            <button className="btn-primary" onClick={() => setShowAIGenerator(true)} style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', height: '36px',
                                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.15))',
                                border: '1px solid rgba(139,92,246,0.3)',
                                color: '#8b5cf6'
                            }}
                            title={t('procedures.useAiToAutomaticallyGenerateTip')}
                            >
                                <Bot size={16} /> {t('procedures.aiGenerate')}
                            </button>
                            <button className="btn-primary" onClick={handlePrint} title={t('procedures.printTheCurrentSopOrTip')} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px' }}>
                                <Printer size={16} /> {t('procedures.printCatalog')}
                            </button>
                        </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        <ProceduresListView 
                            plantId={plantId} 
                            type={nestedTab} 
                            onView={handleViewSOP} 
                            onEditTask={(task) => setEditingTaskData(task)}
                            onViewTask={(task) => setViewingTask(task)}
                            refreshKey={refreshKey} 
                        />
                    </div>

                </div>
            </div>

            {viewingProc && (
                <div className="modal-overlay" onClick={() => { if (!isEditing) setViewingProc(null); }}>
                    <div className="glass-card modal-content-standard" style={{ border: '1px solid var(--primary)' }} onClick={e => e.stopPropagation()}>

                        <ActionBar
                            title={procDetails?.Description || viewingProc.id}
                            icon={<PenTool size={20} />}
                            isEditing={isEditing}
                            onEdit={handleEditStart}
                            onSave={handleSaveEdit}
                            onPrint={handlePrint}
                            onClose={() => { setViewingProc(null); setIsEditing(false); }}
                            onCancel={() => setIsEditing(false)}
                            onDelete={handleDelete}
                            extraButtons={[
                                { label: 'Email', icon: <Mail size={14} />, onClick: handleEmail, title: 'Email this procedure' }
                            ]}
                        />

                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '30px' }}>
                            {loadingDetails ? (
                                <div style={{ textAlign: 'center', padding: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                    <div className="spinning" style={{ border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '40px', height: '40px' }}></div>
                                    <p style={{ color: 'var(--text-muted)' }}>{t('procedures.retrievingProcedureDocumentation')}</p>
                                </div>
                            ) : (
                                <React.Fragment>
                                    {isEditing ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <div className="form-group">
                                                <label>{t('procedures.procedureIdLocked')}</label>
                                                <input type="text" value={editData.ID} disabled style={{ opacity: 0.6 }} title={t('procedures.procedureIdLockedCannotBeTip')} />
                                            </div>
                                            <div className="form-group">
                                                <label>{t('procedures.description')}</label>
                                                <input 
                                                    type="text" 
                                                    value={editData.Description} 
                                                    onChange={e => setEditData({...editData, Description: e.target.value})}
                                                    style={{ width: '100%', padding: '10px' }}
                                                    title={t('procedures.descriptiveNameForThisProcedureTip')}
                                                />
                                            </div>

                                            <div style={{ marginTop: '20px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                                    <h3 style={{ margin: 0 }}>{t('procedures.standardOperatingSteps')}</h3>
                                                    <button className="btn-primary" onClick={() => {
                                                        const newTasks = [...editData._tasks, { TskOrder: editData._tasks.length + 1, Description: '', Instructions: '' }];
                                                        setEditData({...editData, _tasks: newTasks});
                                                    }}
                                                    title={t('procedures.addANewStepToTip')}
                                                    >+ Add Step</button>
                                                </div>
                                                
                                                {editData._tasks.map((step, idx) => (
                                                    <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid var(--glass-border)' }}>
                                                        <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                                                            <div style={{ width: '80px' }}>
                                                                <label style={{ fontSize: '0.7rem' }}>{t('procedures.order')}</label>
                                                                <input type="number" value={step.TskOrder} onChange={e => {
                                                                    const nt = [...editData._tasks];
                                                                    nt[idx].TskOrder = parseInt(e.target.value, 10);
                                                                    setEditData({...editData, _tasks: nt});
                                                                }} style={{ width: '100%' }} title={t('procedures.executionOrderForThisStepTip')} />
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <label style={{ fontSize: '0.7rem' }}>{t('procedures.stepTitle')}</label>
                                                                <input type="text" value={step.Description} onChange={e => {
                                                                    const nt = [...editData._tasks];
                                                                    nt[idx].Description = e.target.value;
                                                                    setEditData({...editData, _tasks: nt});
                                                                }} style={{ width: '100%' }} title={t('procedures.briefTitleForThisStepTip')} />
                                                            </div>
                                                            <button style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', marginTop: '20px' }} onClick={() => {
                                                                const nt = editData._tasks.filter((_, i) => i !== idx);
                                                                setEditData({...editData, _tasks: nt});
                                                            }}  title={t('procedures.removeThisStepFromTheTip')}>{t('procedures.remove')}</button>
                                                        </div>
                                                        <label style={{ fontSize: '0.7rem' }}>{t('procedures.instructions')}</label>
                                                        <textarea 
                                                            rows="4"
                                                            value={step.Instructions || ''}
                                                            onChange={e => {
                                                                const nt = [...editData._tasks];
                                                                nt[idx].Instructions = e.target.value;
                                                                setEditData({...editData, _tasks: nt});
                                                            }}
                                                            style={{ width: '100%', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--glass-border)', padding: '10px' }}
                                                            title={t('procedures.detailedStepbystepInstructionsTip')}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <React.Fragment>
                                            <div style={{ marginBottom: '40px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                                    <div style={{ width: '4px', height: '24px', background: 'var(--primary)', borderRadius: '2px' }}></div>
                                                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{t('procedures.standardOperatingInstructions')}</h3>
                                                </div>

                                                {procDetails?._tasks?.length > 0 ? (
                                                    procDetails._tasks.map((step, i) => (
                                                        <div key={i} className="panel-box" style={{ padding: '20px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                                <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1rem' }}>STEP {step.TskOrder}: {step.Description}</div>
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Task ID: {step.ID}</div>
                                                            </div>
                                                            <div className="print-instruction-box" style={{
                                                                background: 'rgba(15, 23, 42, 0.4)',
                                                                padding: '15px',
                                                                borderRadius: '8px',
                                                                whiteSpace: 'pre-wrap',
                                                                fontFamily: "'Inter', sans-serif",
                                                                fontSize: '10pt',
                                                                color: 'var(--text-main)',
                                                                lineHeight: 1.6,
                                                                border: '1px solid var(--glass-border)'
                                                            }}>
                                                                {step.Instructions || 'No formal instruction text defined.'}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                                        {t('procedures.noProceduralStepsAre')}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                                    <div style={{ width: '4px', height: '24px', background: '#10b981', borderRadius: '2px' }}></div>
                                                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{t('procedures.requiredPartsConsumables')}</h3>
                                                </div>

                                                {procDetails?._parts?.length > 0 ? (
                                                    <table className="data-table">
                                                        <thead>
                                                            <tr>
                                                                <th>{t('procedures.partReference')}</th>
                                                                <th>{t('procedures.description')}</th>
                                                                <th style={{ textAlign: 'right' }}>{t('procedures.qty')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {procDetails._parts.map((p, idx) => (
                                                                <tr key={idx}>
                                                                    <td style={{ fontWeight: 'bold', color: '#10b981' }}>{p.ID}</td>
                                                                    <td>{p.Description}</td>
                                                                    <td style={{ fontWeight: 'bold', textAlign: 'right' }}>{p.EstQty}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                                                        {t('procedures.noSpecificPartsAre')}
                                                    </div>
                                                )}
                                            </div>
                                        </React.Fragment>
                                    )}
                                </React.Fragment>
                            )}
                        </div>

                        {/* ── Photo & File Attachments ── */}
                        {!loadingDetails && procDetails && (
                            <div style={{ padding: '0 30px 20px 30px' }}>
                                <GenericAttachments entityType="procedures" entityId={procDetails.ID || viewingProc?.id} />
                            </div>
                        )}

                        {!isEditing && !loadingDetails && (
                            <div className="modal-footer">
                                <button className="btn-danger" onClick={handleDelete} title={t('procedures.permanentlyDeleteThisProcedureTip')}>{t('procedures.delete')}</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {viewingTask && (
                <div className="modal-overlay" onClick={() => setViewingTask(null)}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
                        <ActionBar
                            title={viewingTask.Description || viewingTask.Descript || viewingTask.ID}
                            icon={<Map size={20} />}
                            onPrint={() => window.triggerTrierPrint('task-detail', viewingTask)}
                            onEdit={() => { setViewingTask(null); setEditingTaskData(viewingTask); }}
                            onClose={() => setViewingTask(null)}
                            showDelete={false}
                        />
                        <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                                <InfoRow label="Task Code" value={viewingTask.ID} />
                                <InfoRow label="Category" value={viewingTask.TaskTypID || 'General'} />
                                <InfoRow label="Description" value={viewingTask.Description || viewingTask.Descript} />
                            </div>
                            <div className="panel-box" style={{ padding: 15 }}>
                                <strong style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>INSTRUCTIONAL PROCESS</strong>
                                <div style={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: "'Inter', sans-serif",
                                    fontSize: '0.9rem',
                                    lineHeight: 1.7,
                                    color: 'var(--text-main)',
                                    background: 'rgba(15, 23, 42, 0.4)',
                                    padding: 15,
                                    borderRadius: 8,
                                    border: '1px solid var(--glass-border)',
                                    minHeight: 120
                                }}>
                                    {viewingTask.Tasks || viewingTask.Instructions || 'No instructional text defined.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {editingTaskData && (
                <div className="modal-overlay" onClick={() => setEditingTaskData(null)}>
                    <div className="glass-card" style={{ 
                        border: '1px solid var(--primary)', 
                        width: '95vw', 
                        height: '85vh', 
                        maxWidth: '1200px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        padding: 0
                    }} onClick={e => e.stopPropagation()}>
                        
                        {/* Header */}
                        <div style={{ padding: '20px 30px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <PenTool color="var(--primary)" size={24} />
                                <div>
                                    <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.2rem' }}>{t('procedures.masterTaskLaboratory')}</h3>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>REVISING SYSTEM RECORD: {editingTaskData.ID}</div>
                                </div>
                            </div>
                            <button onClick={() => setEditingTaskData(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '10px' }} title={t('procedures.discardChanges')}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Editor Body */}
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            
                            {/* Left Meta Panel */}
                            <div style={{ width: '320px', padding: '30px', borderRight: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '25px' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)', marginBottom: '8px', display: 'block' }}>{t('procedures.instructionalLabel')}</label>
                                    <input 
                                        type="text" 
                                        placeholder={t('procedures.briefTitleEgOil')}
                                        value={editingTaskData.Description || editingTaskData.Descript || ''} 
                                        onChange={e => setEditingTaskData({...editingTaskData, Description: e.target.value, Descript: e.target.value})}
                                        style={{ width: '100%', fontSize: '1rem', fontWeight: 'bold' }}
                                        title={t('procedures.briefLabelForThisTaskTip')}
                                    />
                                </div>

                                <div className="form-group">
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)', marginBottom: '8px', display: 'block' }}>{t('procedures.classificationCategory')}</label>
                                    <input 
                                        type="text" 
                                        placeholder={t('procedures.categoryIdEgPm')}
                                        value={editingTaskData.TaskTypID || ''} 
                                        onChange={e => setEditingTaskData({...editingTaskData, TaskTypID: e.target.value})}
                                        style={{ width: '100%' }}
                                        title={t('procedures.classificationCategoryCodeEgPmTip')}
                                    />
                                </div>

                                <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('procedures.protipVoiceTranscription')}</h4>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                                        Use the **Hold to Speak** system on the right to dictate complex procedures. Speak clearly; the system will append your voice directly to the instructions.
                                    </p>
                                </div>
                            </div>

                            {/* Right Instruction Panel (MAXIMIZED) */}
                            <div style={{ flex: 1, padding: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)', display: 'block' }}>{t('procedures.detailedInstructionalProcess')}</label>
                                    <PushToTalkButton 
                                        onResult={(text) => {
                                            const current = editingTaskData.Tasks || editingTaskData.Instructions || '';
                                            const updated = current + (current ? ' ' : '') + text;
                                            setEditingTaskData({...editingTaskData, Tasks: updated, Instructions: updated});
                                        }}
                                    />
                                </div>
                                <textarea 
                                    placeholder={t('procedures.enterStepbystepInstructionsHere')}
                                    value={editingTaskData.Tasks || editingTaskData.Instructions || ''} 
                                    onChange={e => setEditingTaskData({...editingTaskData, Tasks: e.target.value, Instructions: e.target.value})}
                                    style={{ 
                                        flex: 1, 
                                        background: 'rgba(0,0,0,0.3)', 
                                        color: '#fff', 
                                        border: '1px solid var(--glass-border)', 
                                        padding: '20px', 
                                        width: '100%',
                                        fontSize: '1.1rem',
                                        lineHeight: 1.6,
                                        fontFamily: 'monospace',
                                        resize: 'none',
                                        borderRadius: '12px',
                                        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
                                    }}
                                    title={t('procedures.detailedStepbystepInstructionsForThisTip')}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '20px 30px', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                            <button className="btn-nav" onClick={() => setEditingTaskData(null)} title={t('procedures.cancelAndDiscardAllChangesTip')} style={{ padding: '10px 25px' }}>{t('procedures.cancelDiscard')}</button>
                            <button 
                                className="btn-primary" 
                                onClick={handleSaveTaskMaster}
                                style={{ 
                                    background: 'var(--primary)', 
                                    padding: '10px 40px', 
                                    fontSize: '1rem', 
                                    fontWeight: 'bold',
                                    boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)' 
                                }}
                            title={t('procedures.saveThisTaskToTheTip')}
                            >
                                {t('procedures.commitToMasterDatabase')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAIGenerator && (
                <AISopGenerator 
                    plantId={plantId}
                    onClose={() => setShowAIGenerator(false)}
                    onSaved={triggerRefresh}
                />
            )}
        </React.Fragment>
    );
}

function ProceduresListView({ plantId, type, onView, onEditTask, onViewTask, refreshKey }) {
    const { t } = useTranslation();
    const [data, setData] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        setLoading(true);
        const endpoint = type === 'tasks' ? '/api/procedures/tasks' : '/api/procedures';
        fetch(endpoint, { headers: { 'x-plant-id': plantId } })
            .then(res => res.json())
            .then(json => { setData(json.data || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [plantId, refreshKey, type]);

    if (loading) return <LoadingSpinner message={t('procedures.accessingSopDatabase')} />;

    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '25px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-muted)' }}>{type.toUpperCase()} DOCUMENT EXPLORER</h3>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Showing {data.length} registered documents</div>
            </div>

            <div className="table-container" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <table className="data-table">
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-dark)', zIndex: 10 }}>
                        {type === 'tasks' ? (
                            <tr>
                                <th>{t('procedures.taskCode')}</th>
                                <th>{t('procedures.instructionalLabelDescription')}</th>
                                <th>{t('procedures.category')}</th>
                                <th>{t('procedures.processNote')}</th>
                                <th style={{ textAlign: 'right' }}>{t('procedures.actions')}</th>
                            </tr>
                        ) : (
                            <tr>
                                <th>{t('procedures.documentId')}</th>
                                <th>{t('procedures.description')}</th>
                                <th>{t('procedures.location')}</th>
                                <th>{t('procedures.revision')}</th>
                                <th>{t('procedures.authorAuthority')}</th>
                                <th style={{ textAlign: 'right' }}>{t('procedures.actions')}</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {data.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
                                    {t('procedures.noDocumentsFoundIn')}
                                </td>
                            </tr>
                        ) : (
                            data.map(proc => {
                                const isTask = type === 'tasks';
                                return (
                                <tr key={`${proc.plantId || 'local'}-${proc.ID}`}
                                    onClick={() => !isTask && onView(proc.ID, proc.plantId)}
                                    style={{ cursor: isTask ? 'default' : 'pointer', transition: 'background 0.2s' }}
                                    className="hover-row"
                                >
                                    <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{proc.ID}</td>
                                    <td style={{ maxWidth: '400px' }}>{proc.Description || proc.Descript}</td>
                                    {isTask ? (
                                        <React.Fragment>
                                            <td style={{ color: 'var(--text-muted)' }}>{proc.TaskTypID || 'General'}</td>
                                            <td style={{ maxWidth: '300px', fontSize: '0.8rem' }}>{proc.Tasks || proc.Instructions}</td>
                                        </React.Fragment>
                                    ) : (
                                        <React.Fragment>
                                            <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{proc.plantLabel || 'Demo Plant 1'}</td>
                                            <td>Rev {proc.RevNum || 0}</td>
                                            <td>{proc.Author || 'Corporate'}</td>
                                        </React.Fragment>
                                    )}
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                            {!isTask && proc.plantId && proc.plantId !== localStorage.getItem('nativePlantId') && (
                                                <button                                                     className="btn-primary"
                                                    style={{
                                                        padding: '4px 10px',
                                                        fontSize: '0.7rem',
                                                        background: 'rgba(16, 185, 129, 0.1)',
                                                        color: '#10b981',
                                                        border: '1px solid #10b981'
                                                    }}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (await confirm(`Do you want to implement SOP ${proc.ID} to your local database?`)) {
                                                            try {
                                                                 const res = await fetch('/api/procedures/clone', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                        sourcePlantId: proc.plantId,
                                                                        procedureId: proc.ID,
                                                                        targetPlantId: localStorage.getItem('nativePlantId') || 'Demo_Plant_1'
                                                                    })
                                                                 });
                                                                 if (res.ok) window.trierToast?.success(`SOP ${proc.ID} cloned successfully!`);
                                                                 else window.trierToast?.error('Failed to clone SOP');
                                                            } catch (err) {
                                                                window.trierToast?.error('Error during cloning process');
                                                            }
                                                        }
                                                    }}
                                                    title={`Clone SOP ${proc.ID} to your local plant database`}
                                                >
                                                    <Download size={14} />
                                                </button>
                                            )}
                                            {!isTask && (
                                                <>
                                                    <ActionBtn icon={Eye} tip={`View procedure ${proc.ID}`} color="#3b82f6" onClick={() => onView(proc.ID, proc.plantId)} />
                                                    <ActionBtn icon={Pencil} tip={`Edit procedure ${proc.ID}`} color="#f59e0b" onClick={() => { onView(proc.ID, proc.plantId); setTimeout(() => document.querySelector('.modal-content-standard .btn-edit')?.click(), 600); }} />
                                                </>
                                            )}
                                            {isTask && (<>
                                                <ActionBtn icon={Eye} tip={`View task ${proc.ID}`} color="#3b82f6" onClick={() => onViewTask(proc)} />
                                                <ActionBtn icon={Pencil} tip={`Edit task ${proc.ID}`} color="#f59e0b" onClick={() => onEditTask(proc)} />
                                            </>)}
                                        </div>
                                    </td>
                                </tr>
                            )})
                        )}
                    </tbody>
                </table>
            </div>

            <style>{`
                .hover-row:hover { background: rgba(255,255,255,0.05) !important; }
                .spinning { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
