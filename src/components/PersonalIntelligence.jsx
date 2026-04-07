// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Personal Intelligence
 * ==================================
 * Your personal watchlist across the entire Trier OS platform.
 * Follow work orders, assets, parts, and vendors to see all your
 * watched items in one place — your mission, your data, your intel.
 *
 * KEY FEATURES:
 *   - Follow any record: star a WO, asset, part, or vendor to add to watchlist
 *   - Unified feed: all followed items shown in a single sorted list
 *   - Type filter: view only WOs / Assets / Parts / Vendors at a time
 *   - Status callouts: see current status of each followed item at a glance
 *   - Activity indicators: recent changes to watched items highlighted
 *   - Unfollow: remove items from watchlist with one click
 *   - Search within watchlist: filter by name or identifier
 *   - Click-through: navigate directly to the watched item's detail panel
 *
 * FOLLOWED ITEM TYPES:
 *   work_order | asset | part | vendor | procedure
 *
 * API CALLS:
 *   GET    /api/personal-intelligence          — All followed items for current user
 *   POST   /api/personal-intelligence          — Follow a new item
 *   DELETE /api/personal-intelligence/:id      — Unfollow an item
 */
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Wrench, Cog, Package, Users, BookOpen, BarChart3, RefreshCw, Star, Search, Filter, Clock, ChevronRight } from 'lucide-react';
import SearchBar from './SearchBar';
import { formatDate } from '../utils/formatDate';
import { useTranslation } from '../i18n/index.jsx';

const TYPE_CONFIG = {
    work_order: { icon: Wrench, label: 'Work Orders', color: '#f59e0b', emoji: '🔧' },
    asset:      { icon: Cog,    label: 'Assets',      color: '#3b82f6', emoji: '⚙️' },
    part:       { icon: Package, label: 'Parts',       color: '#8b5cf6', emoji: '📦' },
    vendor:     { icon: Users,   label: 'Vendors',     color: '#10b981', emoji: '🏪' },
    procedure:  { icon: BookOpen, label: 'Procedures', color: '#06b6d4', emoji: '📋' },
    report:     { icon: BarChart3, label: 'Reports',   color: '#ec4899', emoji: '📊' },
};

export default function PersonalIntelligence({ onNavigate }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    const fetchWatchlist = async () => {
        const token = localStorage.getItem('authToken');
        if (!token) { setLoading(false); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/watchlist', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) { setLoading(false); return; }
            const data = await res.json();
            setItems(data.items || []);
        } catch (err) {
            console.error('Failed to load watchlist:', err);
        }
        setLoading(false);
    };

    useEffect(() => { fetchWatchlist(); }, []);

    const removeItem = async (id) => {
        try {
            await fetch(`/api/watchlist/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (err) {
            console.error('Failed to remove:', err);
        }
    };

    // Group by type
    const types = [...new Set(items.map(i => i.item_type))];
    const filteredItems = items.filter(i => {
        if (filter !== 'all' && i.item_type !== filter) return false;
        if (search && !(i.item_label || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const grouped = {};
    filteredItems.forEach(item => {
        if (!grouped[item.item_type]) grouped[item.item_type] = [];
        grouped[item.item_type].push(item);
    });

    return (
        <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 24,
                animation: 'mcTileIn 0.4s ease both'
            }}>
                <div>
                    <h2 style={{
                        fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 800,
                        background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        margin: 0, display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                        <Star size={24} color="#f59e0b" fill="#f59e0b" />
                        Personal Intelligence
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '6px 0 0 0' }}>
                        Items you're following across the platform · {items.length} total
                    </p>
                </div>
                <button onClick={fetchWatchlist} disabled={loading}
                    style={{
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                        color: '#f59e0b', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                        fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6,
                    }} title={t('personalIntel.refreshTip')}>
                    <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
                </button>
            </div>

            {/* Filter + Search Bar */}
            <div style={{
                display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap',
                animation: 'mcTileIn 0.4s ease 0.1s both',
            }}>
                {/* Type filter chips */}
                <button onClick={() => setFilter('all')}
                    style={{
                        background: filter === 'all' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${filter === 'all' ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.06)'}`,
                        color: filter === 'all' ? '#f59e0b' : '#94a3b8',
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                    }} title={t('personalIntel.filterTip')}>
                    All ({items.length})
                </button>
                {types.map(type => {
                    const cfg = TYPE_CONFIG[type] || {};
                    const count = items.filter(i => i.item_type === type).length;
                    return (
                        <button key={type} onClick={() => setFilter(type)}
                            style={{
                                background: filter === type ? `${cfg.color}20` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${filter === type ? cfg.color + '50' : 'rgba(255,255,255,0.06)'}`,
                                color: filter === type ? cfg.color : '#94a3b8',
                                padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                            }} title={t('personalIntel.filterTip')}>
                            {cfg.emoji} {cfg.label} ({count})
                        </button>
                    );
                })}

                {/* Search */}
                <SearchBar value={search} onChange={setSearch} placeholder={t('personalIntel.searchWatchedItemsPlaceholder')} style={{ flex: 1, minWidth: 180 }} />
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={24} className="spinning" />
                    <div style={{ marginTop: 12 }}>Loading your intelligence feed...</div>
                </div>
            ) : items.length === 0 ? (
                <div style={{
                    padding: '60px 30px', textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)', borderRadius: 16,
                    border: '1px dashed rgba(255,255,255,0.08)',
                    animation: 'mcTileIn 0.4s ease 0.2s both',
                }}>
                    <Star size={48} color="#1e293b" style={{ marginBottom: 16 }} />
                    <h3 style={{ color: '#475569', fontSize: '1.1rem', margin: '0 0 8px 0' }}>
                        Your Intelligence Feed is Empty
                    </h3>
                    <p style={{ color: '#334155', fontSize: '0.85rem', margin: 0, maxWidth: 400, marginInline: 'auto', lineHeight: 1.6 }}>
                        Start following items from any workspace. Look for the <strong>{t('personalIntel.follow')}</strong> button 
                        on work orders, assets, and parts to add them here.
                    </p>
                </div>
            ) : filteredItems.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    No items match your filter.
                </div>
            ) : (
                /* Grouped item cards */
                Object.entries(grouped).map(([type, typeItems]) => {
                    const cfg = TYPE_CONFIG[type] || { icon: Eye, label: type, color: '#94a3b8', emoji: '📌' };
                    const TypeIcon = cfg.icon;

                    return (
                        <div key={type} style={{
                            marginBottom: 20,
                            animation: 'mcTileIn 0.4s ease 0.15s both',
                        }}>
                            {/* Section header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                marginBottom: 10, paddingBottom: 8,
                                borderBottom: `1px solid ${cfg.color}20`,
                            }}>
                                <TypeIcon size={18} color={cfg.color} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: cfg.color }}>
                                    {cfg.emoji} {cfg.label}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b', padding: '2px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                                    {typeItems.length}
                                </span>
                            </div>

                            {/* Item cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                {typeItems.map(item => (
                                    <WatchedItemCard
                                        key={item.id}
                                        item={item}
                                        config={cfg}
                                        onRemove={() => removeItem(item.id)}
                                        onNavigate={onNavigate}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

function WatchedItemCard({ item, config, onRemove, onNavigate }) {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState(false);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: hovered
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hovered ? config.color + '30' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', gap: 12,
                position: 'relative',
            }}
            onClick={() => {
                // Navigate to the item's detail view
                if (onNavigate) {
                    const workspace = {
                        work_order: 'jobs',
                        asset: 'assets',
                        part: 'parts',
                        vendor: 'parts',
                        procedure: 'procedures',
                        report: 'history',
                    }[item.item_type] || 'dashboard';
                    onNavigate(workspace);
                }
            }}
        >
            {/* Icon */}
            <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: config.color + '15',
                border: `1px solid ${config.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <config.icon size={18} color={config.color} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {item.item_label}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span><Clock size={10} style={{ marginRight: 3 }} />{formatDate(item.added_at)}</span>
                    {item.item_meta?.status && (
                        <span style={{
                            padding: '1px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                            background: item.item_meta.status === 'Open' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                            color: item.item_meta.status === 'Open' ? '#f59e0b' : '#10b981',
                        }}>
                            {item.item_meta.status}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions */}
            {hovered && (
                <button 
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444', padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                        fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title={t('personalIntel.stopFollowingThisItemTip')}
                >
                    <EyeOff size={12} /> Unfollow
                </button>
            )}

            <ChevronRight size={16} color={hovered ? config.color : '#334155'} style={{ flexShrink: 0, transition: 'color 0.2s' }} />
        </div>
    );
}

// Export a reusable Follow/Unfollow button for use in other components
export function FollowButton({ itemType, itemId, itemLabel, itemMeta, size = 'normal' }) {
    const [watching, setWatching] = useState(false);
    const [watchId, setWatchId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!itemType || !itemId) return;
        const token = localStorage.getItem('authToken');
        if (!token) { setLoading(false); return; }
        fetch(`/api/watchlist/check/${itemType}/${itemId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.ok ? r.json() : { watching: false })
            .then(data => {
                setWatching(data.watching);
                setWatchId(data.watchId);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [itemType, itemId]);

    const toggle = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            if (watching) {
                await fetch(`/api/watchlist/item/${itemType}/${itemId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
                });
                setWatching(false);
                setWatchId(null);
            } else {
                const res = await fetch('/api/watchlist', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({ itemType, itemId: String(itemId), itemLabel, itemMeta })
                });
                const data = await res.json();
                setWatching(true);
            }
        } catch (err) {
            console.error('Toggle watch failed:', err);
        }
        setLoading(false);
    };

    const isSmall = size === 'small';

    return (
        <button
            onClick={toggle}
            disabled={loading}
            title={watching ? 'Stop following this item' : 'Follow this item to Personal Intelligence'}
            style={{
                background: watching ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${watching ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: watching ? '#f59e0b' : '#94a3b8',
                padding: isSmall ? '3px 8px' : '5px 12px',
                borderRadius: isSmall ? 6 : 8,
                cursor: loading ? 'wait' : 'pointer',
                fontSize: isSmall ? '0.7rem' : '0.78rem',
                fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                transition: 'all 0.2s ease',
                opacity: loading ? 0.6 : 1,
            }}
        >
            {watching ? <Star size={isSmall ? 11 : 13} fill="#f59e0b" /> : <Star size={isSmall ? 11 : 13} />}
            {!isSmall && (watching ? 'Following' : 'Follow')}
        </button>
    );
}
