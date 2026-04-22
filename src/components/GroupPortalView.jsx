// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Group Portal View
 * ================================
 * Sub-hub navigation page for grouped Mission Control tiles. When a user
 * clicks a tile group (e.g. "Safety & Compliance", "Engineering", "IT"),
 * this view renders the group's child tiles as full-width premium cards
 * with a Back to Mission Control breadcrumb button.
 *
 * BEHAVIOR:
 *   - Reads the group ID from route params (:groupId)
 *   - Looks up the group definition from TILE_GROUPS in MissionControl.jsx
 *   - Filters ALL_TILES to the tiles belonging to that group
 *   - Each child tile renders with its icon, description, and status badge
 *   - Clicking a child tile calls onOpenWorkspace(tileId) to navigate
 *
 * This component is the intermediary between Mission Control (top-level)
 * and individual workspace views (AssetsView, FleetView, etc.).
 *
 * @param {string}   plantId          - Current plant identifier
 * @param {string}   plantLabel       - Human-readable plant name
 * @param {Function} onOpenWorkspace  - Callback to open a specific workspace tile
 * @param {Function} onBackToMC       - Callback to return to Mission Control
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Zap } from 'lucide-react';
import { ALL_TILES, TILE_GROUPS } from './MissionControl';
import { useTranslation } from '../i18n/index.jsx';

export default function GroupPortalView({ plantId, plantLabel, onOpenWorkspace, onBackToMC }) {
    const { t } = useTranslation();
    const { groupKey } = useParams();
    const group = TILE_GROUPS[groupKey];
    if (!group) {
        return (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
                <h2>{t('groupPortal.portalNotFound')}</h2>
                <button className="btn-nav" onClick={onBackToMC} style={{ marginTop: 20 }} title={t('groupPortal.backToMissionControlTip')}>
                    ← {t('groupPortal.backToMissionControl', 'Back to Mission Control')}
                </button>
            </div>
        );
    }

    const Icon = group.icon;
    const childKeys = group.children;

    // Fetch live metrics for child tiles
    const [metrics, setMetrics] = useState({});
    const [urgency, setUrgency] = useState({});

    useEffect(() => {
        const headers = { 'x-plant-id': plantId || 'all_sites' };

        fetch('/api/dashboard', { headers })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                const m = {
                    'maintenance':     `${data.openWorkOrders || 0} ${t('mc.metric.open', 'open')} · ${data.overdueWorkOrders || 0} ${t('mc.metric.overdue', 'overdue')}`,
                    'engineering':     `${data.totalAssets || 0} ${t('mc.metric.assetsTracked', 'assets tracked')}`,
                    'supply-chain':    `${data.totalParts || 0} ${t('mc.metric.partsInInventory', 'parts in inventory')}`,
                    'logistics-fleet': `${data.pendingTransfers || 0} ${t('mc.metric.pendingTransfers', 'pending transfers')}`,
                    'compliance':      `${data.totalProcedures || 0} ${t('mc.metric.activeSOPs', 'active SOPs')}`,
                    'governance':      t('mc.metric.auditSecurity', 'Audit & Security'),
                    'analytics':       t('mc.metric.reportsForecasting', 'Reports & Forecasting'),
                    'comms':           t('mc.metric.knowledgeExchange', 'Knowledge Exchange'),
                    'quality':         t('mc.metric.qualityLog', 'Log losses · Cryo · Bacteria'),
                    'sops':            `${data.totalProcedures || 0} ${t('mc.metric.procedures', 'procedures')}`,
                    'directory':       t('mc.metric.enterpriseDirectory', 'Enterprise Directory'),
                    'admin-console':   t('mc.metric.sysAdmin', 'System Administration'),
                    'import-wizard':   t('mc.metric.dataImport', 'Data Import Tools'),
                    'utilities':       t('mc.metric.utilityDashboard', 'Utility intelligence dashboard'),
                };
                setMetrics(m);

                const u = {};
                if (data.overdueWorkOrders > 0) {
                    u['maintenance'] = { count: data.overdueWorkOrders, tooltip: `⚠ ${data.overdueWorkOrders} ${t('mc.urgency.overdueWOsShort', 'overdue work order(s)')}` };
                }
                setUrgency(u);
            })
            .catch(e => console.warn('[GroupPortalView] fetch error:', e));
    }, [plantId, t]);

    return (
        <div style={{
            minHeight: 'calc(100vh - 220px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center',
            padding: '20px 30px 40px',
            position: 'relative',
        }}>
            {/* Ambient glow */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                <div style={{
                    position: 'absolute', width: 500, height: 500, borderRadius: '50%',
                    background: `radial-gradient(circle, ${group.accent}08 0%, transparent 70%)`,
                    top: '5%', right: '-10%',
                }} />
            </div>

            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 1000 }}>

                {/* Portal Header */}
                <div style={{
                    marginBottom: 30,
                    padding: '16px 24px',
                    background: `linear-gradient(135deg, ${group.accent}10 0%, ${group.accent}05 100%)`,
                    border: `1px solid ${group.accent}30`,
                    borderRadius: 16,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: group.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={28} color="#fff" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>{t(`mc.tile.${groupKey}.title`, group.title)}</h1>
                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>{t(`mc.tile.${groupKey}.desc`, group.desc)}</p>
                        </div>
                    </div>
                </div>

                {/* Child Tiles Grid */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 22, width: '100%',
                }}>
                    {childKeys.map((ck, i) => {
                        const child = ALL_TILES[ck];
                        if (!child) return null;
                        return (
                            <PortalChildTile
                                key={ck}
                                tile={child}
                                tileKey={ck}
                                metric={metrics[ck]}
                                urgencyData={urgency[ck] || 0}
                                index={i}
                                onClick={() => {
                                    if (child.route) {
                                        onOpenWorkspace(child.route.replace(/^\//, ''), child.title);
                                    } else {
                                        onOpenWorkspace(child.workspace, child.title);
                                    }
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function PortalChildTile({ tile, tileKey, metric, urgencyData, index, onClick }) {
    const [hovered, setHovered] = useState(false);
    const { t } = useTranslation();
    const Icon = tile.icon;
    const urgencyCount = typeof urgencyData === 'object' ? urgencyData?.count : (urgencyData || 0);

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: `linear-gradient(135deg, ${tile.accent}12 0%, ${tile.accent}06 100%)`,
                backdropFilter: 'blur(12px)',
                border: `1px solid ${hovered ? tile.accent + '60' : tile.accent + '25'}`,
                borderRadius: 16,
                padding: '30px',
                cursor: 'pointer',
                transition: 'all 0.35s',
                transform: hovered ? 'translateY(-6px)' : 'translateY(0)',
                boxShadow: hovered ? `0 20px 56px ${tile.accent}25` : `0 2px 8px rgba(0,0,0,0.15)`,
                position: 'relative',
                display: 'flex', flexDirection: 'column', gap: 14,
            }}
        >
            {urgencyCount > 0 && <div style={{ position: 'absolute', top: 16, right: 16, background: '#ef4444', color: '#fff', fontSize: '0.7rem', padding: '3px 10px', borderRadius: 10 }}>{urgencyCount}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: tile.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={26} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f1f5f9' }}>{t(`mc.tile.${tileKey}.title`, tile.title)}</div>
                    {metric && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>{metric}</div>}
                </div>
                <ChevronRight size={20} color={hovered ? tile.accent : '#334155'} />
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.7 }}>{t(`mc.tile.${tileKey}.desc`, tile.desc)}</p>
            {tile.pills && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {tile.pills.map(p => <span key={p} style={{ background: `${tile.accent}20`, color: tile.accent, fontSize: '0.6rem', padding: '2px 8px', borderRadius: 8 }}>{t(`mc.tile.${tileKey}.pill.${p}`, p)}</span>)}
                </div>
            )}
        </div>
    );
}
