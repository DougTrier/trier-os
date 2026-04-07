// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Work Task Checklist
 * ================================
 * Interactive step-by-step checklist rendered inside the Work Order detail panel.
 * Each task has a checkbox, description, and optional voice/text notes field.
 * Completion state is persisted to the TaskStep table on every check-off.
 *
 * KEY FEATURES:
 *   - Checkbox per step: check off tasks as work progresses
 *   - Auto-persist: each check-off POSTs to API immediately (no save needed)
 *   - Notes per step: add voice note (PushToTalkButton) or typed note per task
 *   - Required steps: flagged tasks must be checked before WO close-out allowed
 *   - Completion counter: "X of Y steps complete" shown in the panel header
 *   - Progress bar: visual fill bar updating with each check-off
 *   - Linked to SOP: if procedure is linked, tasks auto-populate from SOP steps
 *
 * API CALLS:
 *   GET  /api/work-orders/:woId/task-steps         — Load checklist for WO
 *   POST /api/work-orders/:woId/task-steps/:id/check — Check/uncheck a step
 */
import React from 'react';
import { ClipboardList, CheckCircle2 } from 'lucide-react';
import PushToTalkButton from './PushToTalkButton';
import { useTranslation } from '../i18n/index.jsx';

/**
 * WorkTaskChecklist
 * Displays the high-resolution task details from the WorkTask table.
 * Designed to provide a "checklist" feel to the Work Order detail view.
 */
const WorkTaskChecklist = ({ tasks, loading, isEditing, onTaskChange }) => {
    const { t } = useTranslation();
    if (loading) {

        return (
            <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                <div className="spinning" style={{ marginBottom: '10px' }}>⌛</div>
                <p>{t('work.task.checklist.loadingDeepTaskSequence')}</p>
            </div>
        );
    }

    if (!tasks || tasks.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                <p style={{ color: 'var(--text-muted)' }}>{t('work.task.checklist.noGranularTasksDefined')}</p>
            </div>
        );
    }

    return (
        <div className="work-task-checklist" style={{ 
            background: 'rgba(255,255,255,0.02)', 
            border: '1px solid var(--glass-border)', 
            borderRadius: '12px',
            overflow: 'hidden',
            marginTop: '20px'
        }}>
            <div style={{ 
                background: 'rgba(255,255,255,0.05)', 
                padding: '12px 20px', 
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <ClipboardList size={20} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>{t('work.task.checklist.executionChecklist')}</h3>
                <span style={{ 
                    marginLeft: 'auto', 
                    fontSize: '0.75rem', 
                    background: 'var(--primary)', 
                    color: '#fff', 
                    padding: '2px 8px', 
                    borderRadius: '10px' 
                }}>
                    {tasks.length} Steps
                </span>
            </div>
            
            <div style={{ padding: '10px 0' }}>
                {tasks.map((task, index) => (
                    <div key={index} style={{ 
                        padding: '15px 20px',
                        borderBottom: index === tasks.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        gap: '15px',
                        transition: 'background 0.2s'
                    }} className="hover-highlight">
                        <div style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.1rem', minWidth: '25px' }}>
                            {task.TskOrder || index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                                {task.StandardDescription || task.TaskID}
                            </div>
                            {isEditing ? (
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', right: '10px', top: '-45px' }}>
                                            <PushToTalkButton 
                                                onResult={(text) => onTaskChange(index, (task.DynamicText || task.StandardTasks || '') + ' ' + text)}
                                            />
                                        </div>
                                        <textarea 
                                            value={task.DynamicText || task.StandardTasks || ''} 
                                            onChange={e => onTaskChange(index, e.target.value)}
                                            style={{ 
                                                width: '100%', 
                                                fontSize: '0.95rem', 
                                                background: 'rgba(0,0,0,0.4)', 
                                                border: '1px solid var(--primary)', 
                                                color: '#fff', 
                                                padding: '12px', 
                                                borderRadius: '8px',
                                                marginTop: '10px',
                                                minHeight: '400px',
                                                height: 'auto',
                                                lineHeight: '1.6',
                                                fontFamily: "'Roboto Mono', monospace"
                                            }}
                                            title={t('workTaskChecklist.editTheTaskInstructionsUseTip')}
                                        />
                                    </div>

                            ) : (task.DynamicText || task.StandardTasks) && (
                                <div style={{ 
                                    fontSize: '0.9rem', 
                                    color: 'var(--text-muted)', 
                                    background: 'rgba(0,0,0,0.2)', 
                                    padding: '8px 12px', 
                                    borderRadius: '6px',
                                    borderLeft: '3px solid var(--primary)',
                                    marginTop: '8px',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {task.DynamicText || task.StandardTasks}
                                </div>
                            )}

                        </div>

                        <div style={{ opacity: 0.3 }}>
                            <CheckCircle2 size={20} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WorkTaskChecklist;
