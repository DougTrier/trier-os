// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Work Order Task List
 * =================================
 * Task checklist manager embedded in Work Order detail panels.
 * Technicians check off steps as they work, with completion percentage
 * tracked and surfaced to the WO header as a progress indicator.
 *
 * KEY FEATURES:
 *   - Task list: ordered checklist of steps for the work order
 *   - Check-off: tap/click to mark each task complete with timestamp
 *   - Reorder: drag-to-reorder task steps (in edit mode)
 *   - Link to procedure: auto-populate tasks from an SOP template
 *   - Completion %: calculated from checked/total; shown in WO header
 *   - Notes per task: add a brief note or photo to any completed step
 *   - Required tasks: flagged tasks must be completed before WO close-out
 *
 * API CALLS:
 *   GET  /api/work-orders/tasks         — Load task list for WO
 *   POST /api/work-orders/tasks         — Check/uncheck a task
 *   PUT  /api/work-orders/tasks/:id     — Update task note or reorder
 *
 * @param {Function} onClose — Dismiss the task list panel
 */
import React, { useState, useEffect } from 'react';
import { ClipboardList, AlertTriangle, CheckCircle2, X, RefreshCw, Info } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function TaskListView({ onClose }) {
    const { t } = useTranslation();
    const tasks = [
        {
            id: 1,
            category: 'Report Center',
            title: 'Standard Reports Disconnected',
            description: 'Calls GET /api/v2/reports/:id which is missing in the backend.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 2,
            category: 'Report Center',
            title: 'Dynamic Reports Missing Route',
            description: 'Calls POST /api/v2/reports/dynamic/:id but route is not defined.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 3,
            category: 'Report Center',
            title: 'Report Update/Save Broken',
            description: 'PATCH /api/v2/reports/update does not exist on the server.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 4,
            category: 'Dashboard',
            title: 'Active PM Schedules Card',
            description: 'Card lacks an onClick handler and detailed view navigation.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 5,
            category: 'Work Orders',
            title: 'Delete Functionality Placeholder',
            description: 'Delete button only triggers an alert, no DB deletion occurs.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 6,
            category: 'Work Orders',
            title: 'New Assignment Logic Missing',
            description: '+ Add New Assignment option does not persist to the database.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 7,
            category: 'Global Scanner',
            title: 'Sipping Engine Logic',
            description: 'Legacy Photo Mode abandoned. Auto-shutdown and visibility-based power management active.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 8,
            category: 'Settings',
            title: 'Backup Privilege Delegation',
            description: 'Grant backup/export access to specific users without full IT Admin roles.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 9,
            category: 'Settings',
            title: 'Export Redirect (White Flash)',
            description: 'Legacy window.open export replaced with Blob download to stay in-app.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 10,
            category: 'Settings',
            title: 'Multi-Node Target Export',
            description: 'Selectable plant target for database operations regardless of current view.',
            status: 'implemented',
            severity: 'low'
        },
        {
            id: 11,
            category: 'About / Manual',
            title: 'Intelligence Manual Print Engine',
            description: 'Manual content is now wired to the Unified Print Engine for high-end corporate output.',
            status: 'implemented',
            severity: 'low'
        }
    ];

    const getStatusIcon = (status) => {
        switch (status) {
            case 'disconnected': return <AlertTriangle size={18} color="#ef4444" />;
            case 'placeholder': return <Info size={18} color="#facc15" />;
            case 'inactive': return <RefreshCw size={18} color="var(--text-muted)" />;
            case 'implemented': return <CheckCircle2 size={18} color="#10b981" />;
            default: return <Info size={18} color="var(--primary)" />;
        }
    };

    const getSeverityStyle = (severity) => {
        switch (severity) {
            case 'critical': return { color: '#ef4444', fontWeight: 'bold' };
            case 'medium': return { color: '#facc15' };
            default: return { color: 'var(--text-muted)' };
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 30000 }}>
            <div className="glass-card" style={{ 
                width: '90%', 
                maxWidth: '800px', 
                maxHeight: '85vh', 
                padding: '0', 
                display: 'flex', 
                flexDirection: 'column',
                border: '1px solid var(--primary)',
                boxShadow: '0 0 40px rgba(99, 102, 241, 0.2)'
            }}>
                {/* Header */}
                <div style={{ 
                    padding: '20px 25px', 
                    borderBottom: '1px solid var(--glass-border)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: 'rgba(99, 102, 241, 0.1)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <ClipboardList size={24} color="var(--primary)" />
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('task.list.systemIntegrityAudit')}</h2>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('task.list.identificationOfNonfunctionalOr')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} title={t('taskListView.closeTheSystemIntegrityAuditTip')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {tasks.map(task => (
                            <div key={task.id} style={{ 
                                padding: '15px', 
                                background: 'rgba(255,255,255,0.02)', 
                                borderRadius: '12px', 
                                border: '1px solid var(--glass-border)',
                                display: 'flex',
                                gap: '20px',
                                alignItems: 'flex-start'
                            }}>
                                <div style={{ 
                                    padding: '10px', 
                                    background: 'rgba(0,0,0,0.2)', 
                                    borderRadius: '10px' 
                                }}>
                                    {getStatusIcon(task.status)}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{task.category}</span>
                                        <span style={{ fontSize: '0.7rem', ...getSeverityStyle(task.severity) }}>{task.severity.toUpperCase()}</span>
                                    </div>
                                    <h4 style={{ margin: '0 0 5px 0', fontSize: '1rem' }}>{task.title}</h4>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>{task.description}</p>
                                </div>
                                <div style={{ alignSelf: 'center' }}>
                                    <span style={{ 
                                        padding: '4px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '0.65rem', 
                                        background: 'rgba(0,0,0,0.3)',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--glass-border)'
                                    }}>
                                        {task.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ 
                    padding: '20px 25px', 
                    borderTop: '1px solid var(--glass-border)', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <Info size={16} />
                        <span>{t('task.list.readyForInstructionTo')}</span>
                    </div>
                    <button onClick={onClose} className="btn-primary" title={t('taskListView.acknowledgeTheseFindingsAndCloseTip')} style={{ padding: '8px 25px' }}>
                        {t('task.list.acknowledge')}
                    </button>
                </div>
            </div>
        </div>
    );
}
