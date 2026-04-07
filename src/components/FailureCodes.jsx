// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Failure Codes Panel
 * ================================
 * Enterprise System-standard failure analysis panel embedded in Work Order detail.
 * Captures the full fault trifecta: What failed → Why → How it was fixed.
 * All entries are selected from a seeded code library via searchable dropdowns.
 *
 * FAILURE TRIFECTA:
 *   Failure Code   — The component or system that failed (e.g. Bearing, Seal, Belt)
 *   Cause Code     — Root cause of the failure (e.g. Wear, Contamination, Misalignment)
 *   Remedy Code    — How the failure was resolved (e.g. Replaced, Repaired, Adjusted)
 *
 * KEY FEATURES:
 *   - Add multiple failure entries per work order (multi-failure events)
 *   - Searchable dropdowns: type to filter failure/cause/remedy code library
 *   - Free-text description fields for supplementary failure narrative
 *   - Delete entry: remove incorrect failure code entries
 *   - Collapsible: expand/collapse accordion in WO detail panel
 *   - Data feeds MTBF analytics and failure mode Pareto charts
 *
 * API CALLS:
 *   GET    /api/work-orders/:woId/failure-codes        — Load existing failure entries
 *   POST   /api/work-orders/:woId/failure-codes        — Add new failure code entry
 *   DELETE /api/work-orders/:woId/failure-codes/:id    — Remove a failure code entry
 *   GET    /api/failure-codes/library                  — Full seeded code library
 *
 * @param {string|number} woId — Work order ID this panel belongs to
 */
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
export default function FailureCodes({ woId }) {
    const { t } = useTranslation();
    const [entries, setEntries] = useState([]);
    const [library, setLibrary] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [form, setForm] = useState({
        failureCode: '', failureDesc: '',
        causeCode: '', causeDesc: '',
        remedyCode: '', remedyDesc: '',
        severity: 'Medium'
    });

    const token = localStorage.getItem('authToken');
    const plantId = localStorage.getItem('activePlant') || 'Demo_Plant_1';
    const headers = { 'Authorization': `Bearer ${token}`, 'x-plant-id': plantId, 'Content-Type': 'application/json' };

    useEffect(() => {
        if (!woId) return;
        fetch(`/api/failure-codes/${woId}`, { headers })
            .then(r => r.json())
            .then(data => setEntries(Array.isArray(data) ? data : []))
            .catch(() => setEntries([]));

        fetch('/api/failure-codes/library', { headers })
            .then(r => r.json())
            .then(data => setLibrary(Array.isArray(data) ? data : []))
            .catch(() => setLibrary([]));
    }, [woId]);

    const failureCodes = library.filter(c => c.codeType === 'failure');
    const causeCodes = library.filter(c => c.codeType === 'cause');
    const remedyCodes = library.filter(c => c.codeType === 'remedy');

    const handleAdd = async () => {
        if (!form.failureCode && !form.causeCode && !form.remedyCode) return;

        try {
            const res = await fetch(`/api/failure-codes/${woId}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (data.success) {
                setEntries(prev => [{ id: data.id, woId, ...form, createdAt: new Date().toISOString() }, ...prev]);
                setForm({ failureCode: '', failureDesc: '', causeCode: '', causeDesc: '', remedyCode: '', remedyDesc: '', severity: 'Medium' });
                setShowAddForm(false);
            }
        } catch (err) {
            console.error('Add failure code failed:', err);
        }
    };

    const handleDelete = async (id) => {
        if (!await confirm('Remove this failure code entry?')) return;
        try {
            await fetch(`/api/failure-codes/${id}`, { method: 'DELETE', headers });
            setEntries(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            console.error('Delete failure code failed:', err);
        }
    };

    const selectCode = (type, code) => {
        setForm(f => ({
            ...f,
            [`${type}Code`]: code.code,
            [`${type}Desc`]: code.description
        }));
    };

    const severityColors = {
        'Critical': '#ef4444',
        'High': '#f97316',
        'Medium': '#f59e0b',
        'Low': '#10b981'
    };

    const panelStyle = {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
    };

    // Code selector component
    const CodeSelector = ({ label, type, codes, value }) => {
        const [search, setSearch] = useState('');
        const [open, setOpen] = useState(false);
        const filtered = codes.filter(c =>
            c.code.toLowerCase().includes(search.toLowerCase()) ||
            c.description.toLowerCase().includes(search.toLowerCase()) ||
            (c.category || '').toLowerCase().includes(search.toLowerCase())
        );

        return (
            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                </div>
                <div style={{ position: 'relative' }}>
                    <div
                        onClick={() => setOpen(!open)}
                        style={{
                            padding: '8px 10px', background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                            color: value ? '#f1f5f9' : '#475569', fontSize: '0.8rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                    >
                        <span>{value || `Select ${label.toLowerCase()}...`}</span>
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                    {open && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                            background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 8, maxHeight: 200, overflow: 'auto', marginTop: 2,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}>
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder={t('failureCodes.searchCodesPlaceholder')}
                                style={{
                                    width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.05)',
                                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    color: '#f1f5f9', fontSize: '0.75rem', outline: 'none',
                                }}
                            />
                            {filtered.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => { selectCode(type, c); setOpen(false); setSearch(''); }}
                                    style={{
                                        padding: '7px 10px', cursor: 'pointer', fontSize: '0.75rem',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ color: '#818cf8', fontWeight: 700, marginRight: 6 }}>{c.code}</span>
                                    <span style={{ color: '#cbd5e1' }}>{c.description}</span>
                                    <span style={{ color: '#475569', marginLeft: 6, fontSize: '0.65rem' }}>({c.category})</span>
                                </div>
                            ))}
                            {filtered.length === 0 && (
                                <div style={{ padding: '10px', color: '#475569', fontSize: '0.75rem', textAlign: 'center' }}>
                                    No matching codes
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {value && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 3 }}>
                        {form[`${type}Desc`]}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.85rem', color: '#f1f5f9' }}>
                    <AlertTriangle size={16} color="#f59e0b" />
                    Failure / Cause / Remedy
                    {entries.length > 0 && (
                        <span style={{
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700
                        }}>
                            {entries.length}
                        </span>
                    )}
                </div>
                <button 
                    onClick={() => setShowAddForm(!showAddForm)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: showAddForm ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.1)',
                        border: `1px solid ${showAddForm ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
                        borderRadius: 6, color: showAddForm ? '#ef4444' : '#818cf8',
                        fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                    }}
                 title={t('failureCodes.showAddFormTip')}>
                    {showAddForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> Add Code</>}
                </button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10, padding: 14, marginBottom: 12,
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <CodeSelector label="Failure Code" type="failure" codes={failureCodes} value={form.failureCode} />
                        <CodeSelector label="Cause Code" type="cause" codes={causeCodes} value={form.causeCode} />
                        <CodeSelector label="Remedy Code" type="remedy" codes={remedyCodes} value={form.remedyCode} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase' }}>Severity</div>
                            <select
                                value={form.severity}
                                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                                style={{
                                    padding: '6px 10px', background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                                    color: severityColors[form.severity] || '#f1f5f9', fontSize: '0.8rem',
                                    cursor: 'pointer', outline: 'none',
                                }}
                            >
                                <option value="Critical">{t('failureCodes.critical')}</option>
                                <option value="High">{t('failureCodes.high')}</option>
                                <option value="Medium">{t('failureCodes.medium')}</option>
                                <option value="Low">{t('failureCodes.low')}</option>
                            </select>
                        </div>
                        <button
                            onClick={handleAdd}
                            style={{
                                padding: '8px 16px', background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                                border: 'none', borderRadius: 8, color: '#fff', fontSize: '0.8rem',
                                fontWeight: 600, cursor: 'pointer', marginTop: 16,
                            }}
                         title={t('failureCodes.saveEntryTip')}>
                            Save Entry
                        </button>
                    </div>
                </div>
            )}

            {/* Existing entries */}
            {entries.length === 0 && !showAddForm && (
                <div style={{ color: '#475569', fontSize: '0.75rem', textAlign: 'center', padding: '8px 0' }}>
                    No failure codes recorded for this work order
                </div>
            )}
            {entries.map(e => (
                <div key={e.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px',
                    background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 6,
                    border: '1px solid rgba(255,255,255,0.05)',
                }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                        background: severityColors[e.severity] || '#f59e0b',
                        boxShadow: `0 0 6px ${severityColors[e.severity] || '#f59e0b'}40`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 2 }}>
                            {e.failureCode && (
                                <span style={{ fontSize: '0.72rem' }}>
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>Failure:</span>{' '}
                                    <span style={{ color: '#cbd5e1' }}>{e.failureCode}</span>
                                    {e.failureDesc && <span style={{ color: '#64748b' }}> — {e.failureDesc}</span>}
                                </span>
                            )}
                            {e.causeCode && (
                                <span style={{ fontSize: '0.72rem' }}>
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>Cause:</span>{' '}
                                    <span style={{ color: '#cbd5e1' }}>{e.causeCode}</span>
                                    {e.causeDesc && <span style={{ color: '#64748b' }}> — {e.causeDesc}</span>}
                                </span>
                            )}
                            {e.remedyCode && (
                                <span style={{ fontSize: '0.72rem' }}>
                                    <span style={{ color: '#10b981', fontWeight: 700 }}>Remedy:</span>{' '}
                                    <span style={{ color: '#cbd5e1' }}>{e.remedyCode}</span>
                                    {e.remedyDesc && <span style={{ color: '#64748b' }}> — {e.remedyDesc}</span>}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#475569' }}>
                            {e.severity} · {e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}
                        </div>
                    </div>
                    <button 
                        onClick={() => handleDelete(e.id)}
                        style={{
                            background: 'none', border: 'none', color: '#475569',
                            cursor: 'pointer', padding: 2, flexShrink: 0,
                        }}
                        title="Delete"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
        </div>
    );
}
