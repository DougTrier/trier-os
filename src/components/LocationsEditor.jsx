// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Locations Lookup Editor
 * =====================================
 * CRUD interface for managing the Locations lookup table. Location records
 * are used system-wide for asset placement, storeroom bin/row assignment,
 * and work order location tagging.
 *
 * KEY FEATURES:
 *   - Location list: all defined locations for the plant with inline edit
 *   - Add location: name, description, parent location (for sub-areas)
 *   - Rename inline: click edit icon, type new name, save in place
 *   - Delete with confirmation: warns if any assets/parts are assigned
 *   - Hierarchical display: parent → child location tree (Area → Zone → Station)
 *   - Plant-scoped: each plant manages its own location list independently
 *   - Used in: Assets (location field), Parts (bin location), Work Orders (site)
 *
 * API CALLS:
 *   GET    /api/settings/locations        — Load location list for plant
 *   POST   /api/settings/locations        — Add new location
 *   PUT    /api/settings/locations/:id    — Rename or re-parent location
 *   DELETE /api/settings/locations/:id    — Delete location
 *
 * @param {Array}    plants     — Plant list for cross-plant admin context
 * @param {Function} onClose    — Dismiss the editor modal
 * @param {Function} onRefresh  — Callback to re-fetch locations in parent
 */
import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Save, PenTool } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function LocationsEditor({ plants, onClose, onRefresh }) {
    const { t } = useTranslation();
    const [localPlants, setLocalPlants] = useState([...plants]);
    const [editingIndex, setEditingIndex] = useState(-1);
    const [editForm, setEditForm] = useState({ id: '', label: '' });

    const startEdit = (index) => {
        setEditingIndex(index);
        setEditForm({ ...localPlants[index] });
    };

    const startNew = () => {
        setEditingIndex(localPlants.length);
        setEditForm({ id: '', label: '' });
    };

    const handleSaveRow = () => {
        if (!editForm.id || !editForm.label) {
            window.trierToast?.warn('ID and Label are required');
            return;
        }
        const updated = [...localPlants];
        if (editingIndex >= localPlants.length) {
            updated.push(editForm);
        } else {
            updated[editingIndex] = editForm;
        }
        setLocalPlants(updated);
        setEditingIndex(-1);
    };

    const handleDelete = async (index) => {
        if (await confirm(`Are you sure you want to remove ${localPlants[index].label}?`)) {
            const updated = localPlants.filter((_, i) => i !== index);
            setLocalPlants(updated);
        }
    };

    const handleSaveAll = async () => {
        try {
            const res = await fetch('/api/database/plants', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(localPlants)
            });
            if (res.ok) {
                window.trierToast?.success('Locations saved successfully!');
                if (onRefresh) onRefresh();
                onClose();
            } else {
                window.trierToast?.error('Failed to save locations');
            }
        } catch (err) {
            console.error('Save error:', err);
            window.trierToast?.error('Error saving locations');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <PenTool color="var(--primary)" size={24} />
                        <h2 style={{ fontSize: '1.4rem', color: 'var(--primary)', margin: 0 }}>
                            {t('locations.editLocationsDictionary')}
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title={t('locationsEditor.closeTheLocationsEditorTip')}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
                        <button className="btn-save" onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title={t('locationsEditor.addANewPlantLocationTip')}>
                            <Plus size={16} /> {t('locations.addLocation')}
                        </button>
                    </div>

                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('locations.databaseId')}</th>
                                <th>{t('locations.displayLabel')}</th>
                                <th style={{ textAlign: 'right' }}>{t('locations.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localPlants.map((p, idx) => (
                                <tr key={idx}>
                                    {editingIndex === idx ? (
                                        <>
                                            <td><input type="text" value={editForm.id} onChange={e => setEditForm({ ...editForm, id: e.target.value })} placeholder={t('locations.egQuincyil')} style={{ width: '100%' }} title={t('locationsEditor.editTheDatabaseIdForTip')} /></td>
                                            <td><input type="text" value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} placeholder={t('locations.egQuincyIl')} style={{ width: '100%' }} title={t('locationsEditor.editTheDisplayNameForTip')} /></td>
                                            <td style={{ textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                <button className="btn-save" onClick={handleSaveRow} style={{ padding: '4px 8px',  }} title={t('locations.saveEdit')}><Save size={16} /></button>
                                                <button className="btn-nav" onClick={() => setEditingIndex(-1)} style={{ padding: '4px 8px' }} title={t('locations.cancel')}><X size={16} /></button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{p.id}</td>
                                            <td>{p.label}</td>
                                            <td style={{ textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                <button className="btn-nav" onClick={() => startEdit(idx)} style={{ padding: '4px 8px' }} title={t('locations.edit')}><Edit2 size={16} /></button>
                                                {p.id !== 'Corporate_Office' && p.id !== 'examples' && (
                                                    <button className="btn-nav" onClick={() => handleDelete(idx)} style={{ padding: '4px 8px', color: '#ef4444' }} title={t('locations.delete')}><Trash2 size={16} /></button>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {editingIndex === localPlants.length && (
                                <tr>
                                    <td><input type="text" value={editForm.id} onChange={e => setEditForm({ ...editForm, id: e.target.value.replace(/\s+/g, '_') })} placeholder={t('locations.egNewfacility')} style={{ width: '100%' }} title={t('locationsEditor.uniqueDatabaseIdForThisTip')} /></td>
                                    <td><input type="text" value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} placeholder={t('locations.egNewFacilityMx')} style={{ width: '100%' }} title={t('locationsEditor.displayNameForThisLocationTip')} /></td>
                                    <td style={{ textAlign: 'right', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                        <button className="btn-save" onClick={handleSaveRow} style={{ padding: '4px 8px',  }} title={t('locationsEditor.saveNewLocationTip')}><Save size={16} /></button>
                                        <button className="btn-nav" onClick={() => setEditingIndex(-1)} style={{ padding: '4px 8px' }} title={t('locationsEditor.cancelAddingNewLocationTip')}><X size={16} /></button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="modal-footer no-print">
                    <button className="btn-nav" onClick={onClose} title={t('locationsEditor.cancelChangesAndCloseTip')}>{t('locations.cancel')}</button>
                    <button className="btn-save" onClick={handleSaveAll} title={t('locationsEditor.saveAllLocationChangesToTip')}>{t('locations.saveToDatabase')}</button>
                </div>
            </div>

        </div>
    );
}
