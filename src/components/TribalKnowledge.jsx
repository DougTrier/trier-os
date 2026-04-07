// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Institutional Knowledge Vault (Tribal Knowledge)
 * =============================================================
 * Crowdsourced maintenance knowledge repository. Technicians create,
 * search, and browse maintenance tips, equipment quirks, and lessons
 * learned — capturing the unwritten expertise that lives in people's heads.
 *
 * KEY FEATURES:
 *   - Knowledge entry creation: title, body, category, asset link, tags
 *   - Search: full-text search across all entries (title, body, tags)
 *   - Category filter: Tips & Tricks / Equipment Quirks / Root Causes /
 *     Lessons Learned / Safety Notes / Vendor Notes
 *   - Asset linking: entries can be associated with specific assets
 *   - Upvoting: thumbs-up to surface the most helpful entries first
 *   - Most Referenced: analytics showing which entries are accessed most
 *   - Author attribution: created-by and timestamp per entry
 *   - Delete: authors and admins can remove their own entries
 *   - Portal rendering: overlay panel via ReactDOM.createPortal
 *
 * API CALLS:
 *   GET    /api/tribal-knowledge          — Browse knowledge entries
 *   POST   /api/tribal-knowledge          — Create new entry
 *   POST   /api/tribal-knowledge/:id/vote — Upvote an entry
 *   DELETE /api/tribal-knowledge/:id      — Delete entry
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, Plus, ThumbsUp, Trash2, X, Search, Tag, User, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';

/**
 * TribalKnowledge — Wisdom Exchange (Institutional Knowledge)
 * ================================================
 * Wisdom Exchange — captures and surfaces maintenance "tricks of the trade" linked to
 * specific assets, parts, or SOPs. Knowledge persists across work orders
 * and is automatically surfaced when relevant equipment is being serviced.
 *
 * Props:
 *   entityType  — 'asset' | 'part' | 'sop'
 *   entityId    — The ID of the entity (e.g., 'PUMP-4B')
 *   entityLabel — Display name (e.g., 'Centrifugal Pump 4B')
 *   compact     — If true, renders as a small banner (for WO surfacing)
 */
export default function TribalKnowledge({ entityType, entityId, entityLabel, compact = false }) {
    const { t } = useTranslation();
    const [tips, setTips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newBody, setNewBody] = useState('');
    const [newTags, setNewTags] = useState('');
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState(!compact);
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);

    const currentUser = localStorage.getItem('currentUser') || 'system';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
    };

    const fetchTips = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/tribal-knowledge/${entityType}/${encodeURIComponent(entityId)}`, { headers });
            const data = await res.json();
            setTips(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to fetch institutional knowledge:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (entityType && entityId) fetchTips();
    }, [entityType, entityId]);

    const handleAdd = async () => {
        if (!newTitle.trim() || !newBody.trim()) return;
        setSaving(true);
        try {
            await fetch('/api/tribal-knowledge', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    entity_type: entityType,
                    entity_id: entityId,
                    title: newTitle.trim(),
                    body: newBody.trim(),
                    contributed_by: currentUser,
                    tags: newTags.trim()
                })
            });
            setNewTitle('');
            setNewBody('');
            setNewTags('');
            setShowAddForm(false);
            fetchTips();
        } catch (e) {
            console.error('Failed to save knowledge:', e);
        }
        setSaving(false);
    };

    const handleUpvote = async (id) => {
        try {
            const res = await fetch(`/api/tribal-knowledge/${id}/upvote`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ username: currentUser })
            });
            if (res.ok) {
                const data = await res.json();
                setTips(prev => prev.map(tip => {
                    if (tip.id !== id) return tip;
                    if (data.action === 'added') {
                        return { ...tip, upvotes: (tip.upvotes || 0) + 1, voters: [...(tip.voters || []), currentUser] };
                    } else {
                        return { ...tip, upvotes: Math.max(0, (tip.upvotes || 0) - 1), voters: (tip.voters || []).filter(v => v !== currentUser) };
                    }
                }));
            }
        } catch (e) { console.warn('[TribalKnowledge] caught:', e); }
    };

    const handleDelete = async (id) => {
        try {
            await fetch(`/api/tribal-knowledge/${id}`, { method: 'DELETE', headers });
            setTips(prev => prev.filter(tip => tip.id !== id));
            setConfirmDelete(null);
        } catch (e) { console.warn('[TribalKnowledge] caught:', e); }
    };

    const filtered = searchTerm.trim()
        ? tips.filter(t =>
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.tags || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
        : tips;

    // ── Compact Banner Mode (for Work Order surfacing) ──────────────────
    if (compact && tips.length === 0) return null;

    if (compact) {
        return (
            <div style={{
                background: 'rgba(250, 204, 21, 0.08)',
                border: '1px solid rgba(250, 204, 21, 0.25)',
                borderRadius: '10px',
                padding: expanded ? '12px 15px' : '8px 15px',
                marginBottom: '10px',
                transition: 'all 0.2s ease'
            }}>
                <div
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', gap: '8px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Lightbulb size={16} color="#facc15" />
                        <span style={{ fontSize: '0.8rem', color: '#facc15', fontWeight: 600 }}>
                            {tips.length} wisdom tip{tips.length !== 1 ? 's' : ''} for this asset
                        </span>
                    </div>
                    {expanded ? <ChevronUp size={14} color="#facc15" /> : <ChevronDown size={14} color="#facc15" />}
                </div>

                {expanded && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {tips.slice(0, 3).map(tip => (
                            <div key={tip.id} style={{
                                background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: '8px',
                                fontSize: '0.8rem', borderLeft: '3px solid #facc15'
                            }}>
                                <div style={{ fontWeight: 600, color: '#fff', marginBottom: '3px' }}>{tip.title}</div>
                                <div style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}>{tip.body}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ThumbsUp size={10} /> {tip.upvotes || 0}
                                    <span>•</span>
                                    <User size={10} /> {tip.contributed_by}
                                </div>
                            </div>
                        ))}
                        {tips.length > 3 && (
                            <div style={{ fontSize: '0.7rem', color: '#facc15', textAlign: 'center' }}>
                                +{tips.length - 3} more tip{tips.length - 3 !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ── Full Panel Mode (for Asset/Part detail tabs) ─────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Lightbulb size={20} color="#facc15" />
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                        Wisdom Exchange
                    </h3>
                    {tips.length > 0 && (
                        <span style={{
                            background: '#facc1520', color: '#facc15', padding: '2px 8px',
                            borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'bold'
                        }}>
                            {tips.length} tip{tips.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <button 
                    onClick={() => setShowAddForm(!showAddForm)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                        background: showAddForm ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.1)',
                        border: `1px solid ${showAddForm ? 'rgba(239,68,68,0.3)' : 'rgba(250,204,21,0.25)'}`,
                        color: showAddForm ? '#ef4444' : '#facc15',
                        fontSize: '0.8rem', fontWeight: 600,
                        transition: 'all 0.15s ease'
                    }}
                    title={showAddForm ? 'Cancel sharing knowledge' : 'Share a maintenance tip or trick'}
                >
                    {showAddForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Share Knowledge</>}
                </button>
            </div>

            {/* Subtitle */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-8px' }}>
                Please share any quirks or things to look out for from experience
            </div>

            {/* Add Knowledge Form */}
            {showAddForm && (
                <div style={{
                    background: 'rgba(250, 204, 21, 0.05)',
                    border: '1px solid rgba(250, 204, 21, 0.2)',
                    borderRadius: '12px', padding: '15px',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#facc15', marginBottom: '12px' }}>
                        💡 Share Your Wisdom
                    </div>
                    <input
                        type="text"
                        placeholder={t('tribalKnowledge.shortHeadlineEgImpellerAdjustmentPlaceholder')}
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        autoFocus
                        style={{
                            width: '100%', padding: '10px 12px', marginBottom: '10px',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                            borderRadius: '8px', color: '#fff', fontSize: '0.85rem'
                        }}
                        title={t('tribalKnowledge.enterAShortHeadlineForTip')}
                    />
                    <textarea
                        placeholder={t('tribalKnowledge.describeTheTipInDetailPlaceholder')}
                        value={newBody}
                        onChange={e => setNewBody(e.target.value)}
                        rows={4}
                        style={{
                            width: '100%', padding: '10px 12px', marginBottom: '10px',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                            borderRadius: '8px', color: '#fff', fontSize: '0.85rem',
                            resize: 'vertical', lineHeight: '1.5'
                        }}
                        title={t('tribalKnowledge.describeTheTipInDetailTip')}
                    />
                    <input
                        type="text"
                        placeholder={t('tribalKnowledge.tagsCommaseparatedEgBearingSealPlaceholder')}
                        value={newTags}
                        onChange={e => setNewTags(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 12px', marginBottom: '12px',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                            borderRadius: '8px', color: '#fff', fontSize: '0.8rem'
                        }}
                        title={t('tribalKnowledge.addTagsSeparatedByCommasTip')}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                            onClick={() => setShowAddForm(false)}
                            style={{
                                padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
                                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                                color: '#f87171', fontSize: '0.85rem', fontWeight: 600
                            }}
                            title={t('tribalKnowledge.cancelWithoutSavingTip')}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={saving || !newTitle.trim() || !newBody.trim()}
                            style={{
                                padding: '9px 24px', borderRadius: '8px', cursor: 'pointer',
                                background: newTitle.trim() && newBody.trim() ? '#facc15' : 'rgba(255,255,255,0.08)',
                                border: 'none',
                                color: newTitle.trim() && newBody.trim() ? '#1a1a2e' : 'var(--text-muted)',
                                fontSize: '0.85rem', fontWeight: 700,
                                transition: 'all 0.15s ease',
                                opacity: saving ? 0.6 : 1
                            }}
                            title={t('tribalKnowledge.saveThisWisdomTipTip')}
                        >
                            {saving ? 'Saving...' : '💡 Save Knowledge'}
                        </button>
                    </div>
                </div>
            )}

            {/* Search (only show if there are tips) */}
            {tips.length > 3 && (
                <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('tribalKnowledge.searchTipsPlaceholder')} title={t('tribalKnowledge.searchTipsByTitleBodyTip')} />
            )}

            {/* Tips List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Loading knowledge...
                </div>
            ) : filtered.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '40px 20px',
                    color: 'var(--text-muted)', fontSize: '0.85rem'
                }}>
                    <Lightbulb size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <div style={{ marginBottom: '5px' }}>
                        {searchTerm ? 'No tips match your search.' : 'No wisdom shared yet.'}
                    </div>
                    {!searchTerm && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                            Be the first to share wisdom for this {entityType}!
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                    {filtered.map((tip, index) => (
                        <div
                            key={tip.id}
                            style={{
                                background: 'rgba(0,0,0,0.15)',
                                padding: '14px 16px',
                                borderRadius: '10px',
                                border: '1px solid var(--glass-border)',
                                borderLeft: `3px solid ${index === 0 && tip.upvotes > 0 ? '#facc15' : 'var(--glass-border)'}`,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {/* Tip Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                    <Lightbulb size={14} color="#facc15" style={{ flexShrink: 0 }} />
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                                        {tip.title}
                                    </span>
                                    {index === 0 && tip.upvotes > 0 && (
                                        <span style={{
                                            background: '#facc1520', color: '#facc15',
                                            padding: '1px 6px', borderRadius: '6px',
                                            fontSize: '0.6rem', fontWeight: 'bold', flexShrink: 0
                                        }}>
                                            TOP TIP
                                        </span>
                                    )}
                                </div>
                                <button 
                                    onClick={() => setConfirmDelete(tip.id)}
                                    title={t('tribalKnowledge.deleteThisWisdomTipTip')}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--text-muted)',
                                        cursor: 'pointer', padding: '2px', opacity: 0.4, flexShrink: 0
                                    }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            {/* Tip Body */}
                            <div style={{
                                fontSize: '0.85rem', color: 'var(--text-muted)',
                                lineHeight: '1.5', whiteSpace: 'pre-wrap', marginBottom: '8px'
                            }}>
                                {tip.body}
                            </div>

                            {/* Tags */}
                            {tip.tags && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {tip.tags.split(',').filter(t => t.trim()).map((tag, i) => (
                                        <span key={i} style={{
                                            background: 'rgba(99,102,241,0.1)', color: '#818cf8',
                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem',
                                            display: 'flex', alignItems: 'center', gap: '3px'
                                        }}>
                                            <Tag size={9} /> {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Footer: Author, Date, Upvote */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                fontSize: '0.7rem', color: 'var(--text-muted)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <User size={10} /> {tip.contributed_by}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={10} /> {formatDate(tip.created_at)}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => handleUpvote(tip.id)}
                                    disabled={(tip.voters || []).includes(currentUser)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '3px 10px', borderRadius: '6px',
                                        cursor: (tip.voters || []).includes(currentUser) ? 'default' : 'pointer',
                                        background: (tip.voters || []).includes(currentUser) ? 'rgba(16,185,129,0.1)' : 'rgba(250,204,21,0.08)',
                                        border: `1px solid ${(tip.voters || []).includes(currentUser) ? 'rgba(16,185,129,0.25)' : 'rgba(250,204,21,0.15)'}`,
                                        color: (tip.voters || []).includes(currentUser) ? '#10b981' : '#facc15',
                                        fontSize: '0.7rem', fontWeight: 600,
                                        transition: 'all 0.15s ease',
                                        opacity: (tip.voters || []).includes(currentUser) ? 0.7 : 1
                                    }}
                                    title={(tip.voters || []).includes(currentUser) ? 'You already liked this' : 'This tip was helpful'}
                                >
                                    {(tip.voters || []).includes(currentUser) ? '✓' : <ThumbsUp size={11} />} {tip.upvotes || 0}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {/* ── Delete Confirmation Dialog ── */}
            {confirmDelete && createPortal((
                <div className="modal-overlay print-exclude" style={{ zIndex: 10000 }} onClick={() => setConfirmDelete(null)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--card-bg, #1e1e2f)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '14px', padding: '24px 28px', maxWidth: '380px', width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f87171', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Trash2 size={18} /> Delete Wisdom Tip?
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
                            This will permanently remove this tip. This cannot be undone.
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setConfirmDelete(null)}
                                style={{
                                    padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 600
                                }}
                                title={t('tribalKnowledge.keepThisTipTip')}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => handleDelete(confirmDelete)}
                                style={{
                                    padding: '9px 20px', borderRadius: '8px', cursor: 'pointer',
                                    background: '#ef4444', border: 'none',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 700
                                }}
                                title={t('tribalKnowledge.permanentlyDeleteThisWisdomTipTip')}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            ), document.body)}
        </div>
    );
}
