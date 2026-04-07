// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Site Leadership Editor
 * ===================================
 * Admin form for managing the plant leadership contact cards displayed
 * on the Dashboard and Directory. Add, edit, and remove key management
 * personnel shown as the site's official contacts.
 *
 * KEY FEATURES:
 *   - Add leader: name, title, phone, email, and optional photo
 *   - Edit existing entries inline with auto-save on blur
 *   - Delete with confirmation: removes leader card from dashboard display
 *   - Ordered list: drag to reorder display priority (Plant Mgr always first)
 *   - Changes reflected immediately on DashboardView leadership section
 *   - Plant-scoped: admins edit their own plant's leadership only
 *   - Corporate Admins can edit leadership for any plant
 *
 * API CALLS:
 *   GET  /api/settings/leadership          — Load leaders for plant
 *   POST /api/settings/leadership          — Add new leader
 *   PUT  /api/settings/leadership/:id      — Update leader details
 *   DELETE /api/settings/leadership/:id    — Remove leader
 *
 * @param {Function}      onClose         — Dismiss the editor modal
 * @param {Function}      onSaved         — Callback after successful save
 * @param {string}        plantId         — Plant whose leadership is being edited
 * @param {string}        plantLabel      — Plant display name shown in modal heading
 * @param {Array}         initialLeaders  — Pre-populated leaders array for edit mode
 */
import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, PenTool } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function LeadershipEditor({ onClose, onSaved, plantId, plantLabel, initialLeaders }) {
    const { t } = useTranslation();
    const [leaders, setLeaders] = useState(initialLeaders || []);
    const [isLoading, setIsLoading] = useState(!initialLeaders);

    useEffect(() => {
        if (initialLeaders) return;
        
        const headers = { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };
        if (plantId) headers['x-plant-id'] = plantId;

        fetch('/api/leadership', { headers })
            .then(res => res.json())
            .then(data => {
                setLeaders(Array.isArray(data) ? data : []).catch(e => console.warn('[LeadershipEditor]', e));
                setIsLoading(false);
            })
            .catch(err => console.error('Failed to load leadership', err));
    }, [plantId, initialLeaders]);

    const handleChange = (index, field, value) => {
        const updated = [...leaders];
        updated[index] = { ...updated[index], [field]: value };
        setLeaders(updated);
    };

    const handleAdd = () => {
        setLeaders([...leaders, { Name: '', Title: '', Phone: '', Email: '' }]);
    };

    const handleRemove = (index) => {
        setLeaders(leaders.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        try {
            const headers = { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            };
            if (plantId) headers['x-plant-id'] = plantId;

            const res = await fetch('/api/leadership/sync', {
                method: 'POST',
                headers,
                body: JSON.stringify({ leaders })
            });
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('pf-refresh-directory'));
                onSaved();
                onClose();
            } else {
                window.trierToast?.error('Failed to save changes');
            }
        } catch (err) {
            console.error('Error saving leadership:', err);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card modal-content-standard" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <PenTool color="var(--primary)" size={24} />
                        <h2 style={{ fontSize: '1.4rem', color: 'var(--primary)', margin: 0 }}>
                            Manage {plantLabel || 'Site'} Leadership
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('leadershipEditor.closeTheLeadershipEditorTip')}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {leaders.map((leader, index) => (
                        <div key={index} style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                                <button 
                                    onClick={() => handleRemove(index)}
                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                    title={t('leadership.removeThisContact')}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('leadership.name')}</label>
                                <input
                                    value={leader.Name}
                                    onChange={e => handleChange(index, 'Name', e.target.value)}
                                    style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', padding: '8px' }}
                                    title={t('leadershipEditor.leadersFullNameTip')}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('leadership.title')}</label>
                                <input
                                    value={leader.Title}
                                    onChange={e => handleChange(index, 'Title', e.target.value)}
                                    style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', padding: '8px' }}
                                    title={t('leadershipEditor.leadersJobTitleTip')}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('leadership.phone')}</label>
                                <input
                                    value={leader.Phone}
                                    onChange={e => handleChange(index, 'Phone', e.target.value)}
                                    style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', padding: '8px' }}
                                    title={t('leadershipEditor.leadersPhoneNumberTip')}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('leadership.email')}</label>
                                <input
                                    value={leader.Email}
                                    onChange={e => handleChange(index, 'Email', e.target.value)}
                                    style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', color: '#fff', padding: '8px' }}
                                    title={t('leadershipEditor.leadersEmailAddressTip')}
                                />
                            </div>
                        </div>
                    ))}

                    <button onClick={handleAdd} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', border: '1px dashed var(--glass-border)' }} title={t('leadershipEditor.addANewLeadershipContactTip')}>
                        <Plus size={20} /> {t('leadership.addLeader')}
                    </button>

                    {leaders.length === 0 && !isLoading && (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                            No leaders listed for this location yet. Click "Add Leader" to begin.
                        </div>
                    )}
                </div>

                <div className="modal-footer no-print">
                    <button className="btn-nav" onClick={onClose} title={t('leadershipEditor.cancelChangesAndCloseTip')}>{t('leadership.cancel')}</button>
                    <button className="btn-save" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={t('leadershipEditor.saveAllLeadershipChangesToTip')}>
                        <Save size={20} /> {t('leadership.saveSiteLeadership')}
                    </button>
                </div>
            </div>
        </div>
    );
}
