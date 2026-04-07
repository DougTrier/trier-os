// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — ActionBar
 * =====================
 * Platform-standard detail panel toolbar. Every detail panel in Trier OS
 * renders the same View / Edit / Print / Save / Close button row via this
 * component — guaranteeing consistent UX across all 30+ detail panels.
 *
 * BUTTON STATES:
 *   View mode    — Edit button visible; Save/Cancel hidden
 *   Edit mode    — Save + Cancel visible; Edit button hidden
 *   Create mode  — Save + Cancel visible; Edit/Print hidden
 *   Loading      — All action buttons disabled with spinner overlay
 *
 * PROPS:
 * @param {string}    title       — Panel heading (WO number, asset name, etc.)
 * @param {ReactNode} icon        — Left-side icon for the panel type
 * @param {boolean}   isEditing   — Activates edit-mode button layout
 * @param {boolean}   isCreating  — Activates create-mode button layout
 * @param {Function}  onEdit      — Callback: enter edit mode
 * @param {Function}  onSave      — Callback: persist changes
 * @param {Function}  onCancel    — Callback: discard changes / close panel
 * @param {Function}  onPrint     — Callback: trigger print dialog
 * @param {Function}  onClose     — Callback: close panel entirely
 * @param {boolean}   isSaving    — Shows loading spinner on Save button
 * @param {boolean}   hideEdit    — Suppress Edit button (read-only panels)
 * @param {boolean}   hidePrint   — Suppress Print button
 *
 * Usage:
 *   <ActionBar
 *     title={t('actionBar.workOrderWo123Tip')}
 *     icon={<PenTool size={20} />}
 *     isEditing={isEditing}
 *     isCreating={isCreating}
 *     onEdit={handleEdit}
 *     onSave={handleSave}
 *     onPrint={handlePrint}
 *     onClose={() => setSelected(null)}
 *     onDelete={handleDelete}
 *     onCancel={() => setIsEditing(false)}
 *     isSaving={isSaving}
 *     extraButtons={[{ label: 'QR Label', icon: <QrCode />, onClick: fn }]}
 *   />
 */
import React, { useEffect } from 'react';
import { Printer, PenTool, Save, X, Trash2, RefreshCw, QrCode } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function ActionBar({
    title,
    icon,
    isEditing = false,
    isCreating = false,
    onEdit,
    onSave,
    onPrint,
    onClose,
    onDelete,
    onCancel,
    isSaving = false,
    showEdit = true,
    showPrint = true,
    showDelete = true,
    extraButtons = [],
    children
}) {
    const { t } = useTranslation();
    // Keyboard shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            // Ctrl+S = Save (when editing)
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && (isEditing || isCreating)) {
                e.preventDefault();
                if (onSave && !isSaving) onSave();
            }
            // Ctrl+P = Print (when viewing)
            if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !isEditing && !isCreating) {
                e.preventDefault();
                if (onPrint) onPrint();
            }
            // Escape = Close or Cancel editing
            if (e.key === 'Escape') {
                if (isEditing && !isCreating && onCancel) {
                    onCancel();
                } else if (onClose) {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isEditing, isCreating, onSave, onPrint, onClose, onCancel, isSaving]);

    // Determine title text
    const displayTitle = typeof title === 'string' ? title : title;

    return (
        <div className="action-bar" style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderBottom: '1px solid var(--glass-border)',
            flexShrink: 0,
            gap: '10px',
            background: 'rgba(0,0,0,0.1)',
        }}>
            {/* Left: Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 auto' }}>
                {icon && <span style={{ color: 'var(--primary)', flexShrink: 0 }}>{icon}</span>}
                <h1 style={{
                    fontSize: '1.1rem',
                    color: isEditing || isCreating ? '#f59e0b' : 'var(--primary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                }}>
                    {displayTitle}
                </h1>
                {isEditing && !isCreating && (
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                    }}>
                        Editing
                    </span>
                )}
                {isCreating && (
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        flexShrink: 0,
                    }}>
                        New Record
                    </span>
                )}
            </div>

            {/* Right: Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {/* View Mode Buttons */}
                {!isEditing && !isCreating && (
                    <>
                        {/* Print */}
                        {showPrint && onPrint && (
                            <button className="btn-nav" onClick={onPrint} title={t('actionBar.printThisRecordCtrlpTip')} style={{ height: '36px', fontSize: '0.8rem' }}>
                                <Printer size={14} /> {t('common.print', 'Print')}
                            </button>
                        )}

                        {/* Extra buttons (QR Label, Photo, etc.) */}
                        {extraButtons.map((btn, i) => (
                            <button
                                key={i}
                                className={btn.className || 'btn-nav'}
                                onClick={btn.onClick}
                                title={btn.title || btn.label}
                                style={{ height: '36px', fontSize: '0.8rem', ...(btn.style || {}) }}
                            >
                                {btn.icon} {btn.label}
                            </button>
                        ))}

                        {/* Edit */}
                        {showEdit && onEdit && (
                            <button className="btn-edit" onClick={onEdit} title={t('actionBar.editThisRecordTip')} style={{ height: '36px', fontSize: '0.8rem' }}>
                                <PenTool size={14} /> {t('common.edit', 'Edit')}
                            </button>
                        )}
                    </>
                )}

                {/* Edit / Create Mode Buttons */}
                {(isEditing || isCreating) && (
                    <>
                        {/* Cancel (only for edits, not creates) */}
                        {!isCreating && onCancel && (
                            <button className="btn-nav" onClick={onCancel} title={t('actionBar.cancelEditingEscTip')} style={{ height: '36px', fontSize: '0.8rem' }}>
                                <X size={14} /> {t('common.cancel', 'Cancel')}
                            </button>
                        )}

                        {/* Delete (only when editing existing records) */}
                        {showDelete && !isCreating && onDelete && (
                            <button className="btn-danger" onClick={onDelete} title={t('actionBar.deleteThisRecordTip')} style={{ height: '36px', fontSize: '0.8rem' }}>
                                <Trash2 size={14} /> {t('common.delete', 'Delete')}
                            </button>
                        )}

                        {/* Save */}
                        {onSave && (
                            <button
                                className="btn-save"
                                onClick={onSave}
                                disabled={isSaving}
                                title={isCreating ? "Create this record (Ctrl+S)" : "Save changes (Ctrl+S)"}
                                style={{ height: '36px', fontSize: '0.8rem', opacity: isSaving ? 0.7 : 1 }}
                            >
                                {isSaving ? (
                                    <><RefreshCw size={14} className="spinning" /> {t('actionBar.saving', 'Saving...')}</>
                                ) : (
                                    <><Save size={14} /> {isCreating ? t('common.create', 'Create') : t('common.saveChanges', 'Save Changes')}</>
                                )}
                            </button>
                        )}
                    </>
                )}

                {/* Inline children (for custom buttons) */}
                {children}

                {/* Close button — always present (ghost style) */}
                {onClose && (
                    <button
                        onClick={onClose}
                        title={t('actionBar.closeEscTip')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '8px',
                            transition: 'all 0.2s',
                        }}
                    >
                        <X size={22} />
                    </button>
                )}
            </div>
        </div>
    );
}
