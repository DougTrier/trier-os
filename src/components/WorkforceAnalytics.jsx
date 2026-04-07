// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Workforce Analytics
 * ================================
 * Enterprise workforce performance analytics dashboard.
 * Answers the question: "Who's getting jobs done faster — and WHY?"
 *
 * SECTIONS:
 *   overview    — Fleet-level KPIs: avg efficiency %, jobs completed, on-time rate
 *   technicians — Ranked technician table sorted by efficiency score with drill-down
 *   plants      — Cross-plant benchmarking: expected vs actual hours side-by-side
 *   procedures  — SOP effectiveness: which procedures have the highest time variance
 *
 * KEY METRICS:
 *   Efficiency %   = (ExpectedDuration / ActualHours) × 100 — capped at 150%
 *   Time Variance  = ActualHours − ExpectedDuration (negative = ahead of schedule)
 *   On-Time Rate   = % of jobs closed within ExpectedDuration window
 *   SOP Score      = avg efficiency of all WOs linked to a given ProcID
 *
 * KEY FEATURES:
 *   - Expandable technician rows: per-job history, best/worst tasks, trend sparkline
 *   - Sortable columns: efficiency, total jobs, avg hours, on-time rate
 *   - Plant benchmarking heatmap (sorted by aggregate efficiency)
 *   - SOP effectiveness Pareto: procedures with highest average overrun
 *   - Direction indicators: ArrowUpRight (improving) / ArrowDownRight (declining)
 *   - Role-gated: managers see all plants; technicians see own stats only
 *
 * DATA SOURCES:
 *   GET /api/work-orders/workforce-analytics — Cross-plant aggregation
 *   Fields: ExpectedDuration, ActualHours, ProcID from Work table
 *
 * @param {string|number} plantId — Active plant filter
 */
import React, { useState, useEffect } from 'react';
import {
    Activity, Users, Building2, FileText, TrendingUp, TrendingDown,
    Clock, Award, Target, BarChart3, ArrowUpRight, ArrowDownRight,
    ChevronDown, ChevronUp, Zap, Shield, X
} from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function WorkforceAnalytics({ plantId }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeSection, setActiveSection] = useState('overview');
    const [techSortBy, setTechSortBy] = useState('efficiency');
    const [techSortDir, setTechSortDir] = useState('desc');
    const [expandedTech, setExpandedTech] = useState(null);
    const [expandedPlant, setExpandedPlant] = useState(null);

    useEffect(() => {
        fetchAnalytics();
    }, [plantId]);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/work-orders/workforce-analytics', {
                headers: { 'x-plant-id': plantId }
            });
            if (!res.ok) throw new Error('Failed to fetch analytics');
            const result = await res.json();
            setData(result);
        } catch (err) {
            console.error('Workforce Analytics error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '15px' }}>
                <Activity size={36} className="spinning" color="var(--primary)" />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t('workforce.compilingAnalytics', 'Compiling workforce analytics across {scope}...', { scope: plantId === 'all_sites' ? t('workforce.allPlants', 'all plants') : t('workforce.plant', 'plant') })}</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px', color: '#ef4444' }}>
                <X size={36} />
                <span>{t('workforce.analyticsError', 'Analytics Error:')} {error || t('workforce.noDataReturned', 'No data returned')}</span>
                <button className="btn-primary btn-sm" onClick={fetchAnalytics} style={{ marginTop: '10px' }} title={t('workforce.retryTitle', 'Retry')}>{t('workforce.retry', 'Retry')}</button>
            </div>
        );
    }

    const { summary, techPerformance, plantPerformance, sopEffectiveness } = data;

    const getEfficiencyColor = (eff) => {
        if (eff >= 110) return '#10b981';
        if (eff >= 95) return '#22d3ee';
        if (eff >= 80) return '#f59e0b';
        return '#ef4444';
    };

    const getEfficiencyLabel = (eff) => {
        if (eff >= 110) return t('workforce.efficiencyExceptional', 'Exceptional');
        if (eff >= 100) return t('workforce.efficiencyOnTarget', 'On Target');
        if (eff >= 90) return t('workforce.efficiencyNearTarget', 'Near Target');
        if (eff >= 80) return t('workforce.efficiencyBelowTarget', 'Below Target');
        return t('workforce.efficiencyNeedsImprovement', 'Needs Improvement');
    };

    // Sort tech performance
    const sortedTechs = [...techPerformance].sort((a, b) => {
        const mult = techSortDir === 'desc' ? -1 : 1;
        if (techSortBy === 'efficiency') return (a.efficiency - b.efficiency) * mult;
        if (techSortBy === 'onTimeRate') return (a.onTimeRate - b.onTimeRate) * mult;
        if (techSortBy === 'completedWOs') return (a.completedWOs - b.completedWOs) * mult;
        if (techSortBy === 'sopUsageRate') return (a.sopUsageRate - b.sopUsageRate) * mult;
        if (techSortBy === 'name') return a.name.localeCompare(b.name) * mult;
        return 0;
    });

    const toggleTechSort = (field) => {
        if (techSortBy === field) {
            setTechSortDir(techSortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setTechSortBy(field);
            setTechSortDir('desc');
        }
    };

    const SortIcon = ({ field }) => {
        if (techSortBy !== field) return null;
        return techSortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />;
    };

    // Top 3 performers
    const topPerformers = techPerformance.slice(0, 3);
    // Bottom 3
    const bottomPerformers = [...techPerformance].sort((a, b) => a.efficiency - b.efficiency).slice(0, 3);

    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── HEADER BAR ── */}
            <div style={{
                padding: '20px 25px',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <BarChart3 size={24} color="var(--primary)" />
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{t('workforce.pageTitle', 'Workforce Analytics')}</h2>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {plantId === 'all_sites' ? `${t('workforce.enterpriseWide', 'Enterprise-wide')} · ${summary.plantsAnalyzed} ${t('workforce.plants', 'Plants')}` : t('workforce.singlePlantView', 'Single Plant View')}
                        </span>
                    </div>
                </div>

                {/* Section Tabs */}
                <div className="nav-pills">
                    {[
                        { id: 'overview', label: t('workforce.tabOverview', 'Overview'), icon: <Activity size={14} /> },
                        { id: 'technicians', label: t('workforce.tabTechnicians', 'Technicians'), icon: <Users size={14} /> },
                        { id: 'plants', label: t('workforce.tabPlants', 'Plants'), icon: <Building2 size={14} /> },
                        { id: 'sops', label: t('workforce.tabSops', 'SOPs'), icon: <FileText size={14} /> },
                    ].map(tab => (
                        <button key={tab.id} className={`btn-nav${activeSection === tab.id ? ' active' : ''}`}
                            onClick={() => setActiveSection(tab.id)}
                         title={t('workforce.activeSectionTip')}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── CONTENT AREA ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '25px' }} className="custom-scrollbar">

                {/* ═══════════════════════ OVERVIEW SECTION ═══════════════════════ */}
                {activeSection === 'overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>

                        {/* KPI Cards Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                            <KPICard
                                icon={<Target size={22} />}
                                label={t('workforce.kpiOverallEfficiency', 'Overall Efficiency')}
                                value={`${summary.overallEfficiency}%`}
                                color={getEfficiencyColor(summary.overallEfficiency)}
                                subtitle={getEfficiencyLabel(summary.overallEfficiency)}
                            />
                            <KPICard
                                icon={<Clock size={22} />}
                                label={t('workforce.kpiTotalHoursTracked', 'Total Hours Tracked')}
                                value={`${summary.totalExpectedHours.toLocaleString()} ${t('workforce.hrs', 'hrs')}`}
                                color="#3b82f6"
                                subtitle={`${summary.totalActualHours.toLocaleString()} ${t('workforce.hrsActual', 'hrs actual')}`}
                            />
                            <KPICard
                                icon={summary.avgTimeSaved > 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                                label={t('workforce.kpiAvgTimeVariance', 'Avg Time Variance')}
                                value={`${summary.avgTimeSaved > 0 ? '+' : ''}${summary.avgTimeSaved} ${t('workforce.hrs', 'hrs')}`}
                                color={summary.avgTimeSaved >= 0 ? '#10b981' : '#ef4444'}
                                subtitle={summary.avgTimeSaved >= 0 ? t('workforce.underBudget', 'Under budget') : t('workforce.overBudget', 'Over budget')}
                            />
                            <KPICard
                                icon={<Users size={22} />}
                                label={t('workforce.kpiCompletedWorkOrders', 'Completed Work Orders')}
                                value={summary.completedWOs.toLocaleString()}
                                color="#8b5cf6"
                                subtitle={`${t('workforce.of', 'of')} ${summary.totalWOs.toLocaleString()} ${t('workforce.total', 'total')}`}
                            />
                        </div>

                        {/* Top vs Bottom Performers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                            {/* Top Performers */}
                            <div style={{
                                background: 'rgba(16, 185, 129, 0.03)',
                                border: '1px solid rgba(16, 185, 129, 0.15)',
                                borderRadius: '14px',
                                padding: '20px'
                            }}>
                                <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontSize: '1rem' }}>
                                    <Award size={20} /> {t('workforce.topPerformers', 'Top Performers')}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {topPerformers.map((tech, i) => (
                                        <div key={tech.name} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 15px',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: '10px',
                                            border: i === 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent'
                                        }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                background: i === 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16, 185, 129, 0.15)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 700,
                                                fontSize: '0.85rem',
                                                color: i === 0 ? '#fff' : '#10b981'
                                            }}>
                                                {i + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tech.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {tech.completedWOs} {t('workforce.completed', 'completed')} · {tech.plants?.join(', ')}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '1.1rem' }}>{tech.efficiency}%</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tech.onTimeRate}% {t('workforce.onTime', 'on-time')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Coaching Opportunities */}
                            <div style={{
                                background: 'rgba(245, 158, 11, 0.03)',
                                border: '1px solid rgba(245, 158, 11, 0.15)',
                                borderRadius: '14px',
                                padding: '20px'
                            }}>
                                <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px', color: '#f59e0b', fontSize: '1rem' }}>
                                    <Zap size={20} /> {t('workforce.coachingOpportunities', 'Coaching Opportunities')}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {bottomPerformers.map((tech, i) => (
                                        <div key={tech.name} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 15px',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: '10px'
                                        }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                background: 'rgba(245, 158, 11, 0.15)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 700,
                                                fontSize: '0.85rem',
                                                color: '#f59e0b'
                                            }}>
                                                !
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tech.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {t('workforce.sopUsage', 'SOP usage')}: {tech.sopUsageRate}% · {t('workforce.avg', 'Avg')} {tech.avgActual} {t('workforce.hrsPerJob', 'hrs/job')}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '1.1rem' }}>{tech.efficiency}%</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tech.onTimeRate}% {t('workforce.onTime', 'on-time')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Enterprise Efficiency Bar (visual comparison) */}
                        <div style={{
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: '14px',
                            padding: '20px',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <h3 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', color: 'var(--text-muted)' }}>
                                <Building2 size={18} /> {t('workforce.plantEfficiencyRankings', 'Plant Efficiency Rankings')}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {plantPerformance.slice(0, 10).map((plant, i) => {
                                    const barWidth = Math.min(100, (plant.efficiency / 130) * 100);
                                    return (
                                        <div key={plant.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ width: '30px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>
                                            <span style={{ width: '180px', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plant.name}</span>
                                            <div style={{ flex: 1, height: '20px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                                                <div style={{
                                                    width: `${barWidth}%`,
                                                    height: '100%',
                                                    background: `linear-gradient(90deg, ${getEfficiencyColor(plant.efficiency)}88, ${getEfficiencyColor(plant.efficiency)})`,
                                                    borderRadius: '10px',
                                                    transition: 'width 0.8s ease'
                                                }} />
                                                <span style={{
                                                    position: 'absolute',
                                                    right: '8px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: 'rgba(255,255,255,0.8)'
                                                }}>
                                                    {plant.efficiency}%
                                                </span>
                                            </div>
                                            <span style={{ width: '80px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                                {t('workforce.sopCoverageShort', 'SOP')}: {plant.sopCoverage}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════ TECHNICIANS SECTION ═══════════════════════ */}
                {activeSection === 'technicians' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Users size={20} color="var(--primary)" /> {t('workforce.technicianPerformanceBoard', 'Technician Performance Board')}
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {sortedTechs.length} {t('workforce.techniciansWithJobs', 'technicians with 2+ completed jobs')}
                            </span>
                        </div>

                        <div style={{ border: '1px solid var(--glass-border)', borderRadius: '10px', overflow: 'hidden' }}>
                            <table className="data-table" style={{ fontSize: '0.85rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                                    <tr>
                                        <th style={{ width: '40px' }}>#</th>
                                        <th style={{ cursor: 'pointer' }} onClick={() => toggleTechSort('name')}>
                                            {t('workforce.colTechnician', 'Technician')} <SortIcon field="name" />
                                        </th>
                                        <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleTechSort('completedWOs')}>
                                            {t('workforce.colJobs', 'Jobs')} <SortIcon field="completedWOs" />
                                        </th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colAvgExpected', 'Avg Expected')}</th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colAvgActual', 'Avg Actual')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleTechSort('efficiency')}>
                                            {t('workforce.colEfficiency', 'Efficiency')} <SortIcon field="efficiency" />
                                        </th>
                                        <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleTechSort('onTimeRate')}>
                                            {t('workforce.colOnTime', 'On-Time')} <SortIcon field="onTimeRate" />
                                        </th>
                                        <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => toggleTechSort('sopUsageRate')}>
                                            {t('workforce.colSopUsage', 'SOP Usage')} <SortIcon field="sopUsageRate" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedTechs.map((tech, i) => (
                                        <React.Fragment key={tech.name}>
                                            <tr
                                                style={{ cursor: 'pointer', background: expandedTech === tech.name ? 'rgba(99, 102, 241, 0.05)' : undefined }}
                                                onClick={() => setExpandedTech(expandedTech === tech.name ? null : tech.name)}
                                            >
                                                <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {i < 3 && <Award size={14} color="#10b981" />}
                                                        <span style={{ fontWeight: 600 }}>{tech.name}</span>
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{tech.completedWOs}</td>
                                                <td className="hide-mobile" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{tech.avgExpected} {t('workforce.hrs', 'hrs')}</td>
                                                <td className="hide-mobile" style={{ textAlign: 'center', fontWeight: 500 }}>
                                                    <span style={{ color: tech.avgActual <= tech.avgExpected ? '#10b981' : '#f59e0b' }}>
                                                        {tech.avgActual} {t('workforce.hrs', 'hrs')}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '3px 10px',
                                                        borderRadius: '20px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        background: `${getEfficiencyColor(tech.efficiency)}15`,
                                                        color: getEfficiencyColor(tech.efficiency),
                                                        border: `1px solid ${getEfficiencyColor(tech.efficiency)}30`
                                                    }}>
                                                        {tech.efficiency >= 100 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                                        {tech.efficiency}%
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span style={{ color: tech.onTimeRate >= 70 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                                                        {tech.onTimeRate}%
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                        <div style={{ width: '50px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${tech.sopUsageRate}%`, height: '100%', background: tech.sopUsageRate >= 80 ? '#10b981' : '#f59e0b', borderRadius: '3px' }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{tech.sopUsageRate}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedTech === tech.name && (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '15px 20px', background: 'rgba(99, 102, 241, 0.03)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                                                            <InfoBlock label={t('workforce.infoTotalWorkOrders', 'Total Work Orders')} value={tech.totalWOs} />
                                                            <InfoBlock label={t('workforce.infoCompleted', 'Completed')} value={tech.completedWOs} />
                                                            <InfoBlock label={t('workforce.infoPlants', 'Plants')} value={tech.plants?.join(', ') || t('workforce.na', 'N/A')} />
                                                            <InfoBlock
                                                                label={t('workforce.infoPerformanceRating', 'Performance Rating')}
                                                                value={getEfficiencyLabel(tech.efficiency)}
                                                                valueColor={getEfficiencyColor(tech.efficiency)}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════ PLANTS SECTION ═══════════════════════ */}
                {activeSection === 'plants' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Building2 size={20} color="var(--primary)" /> {t('workforce.plantPerformanceBenchmark', 'Plant Performance Benchmark')}
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
                            {plantPerformance.map((plant, i) => (
                                <div
                                    key={plant.plantId}
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: '14px',
                                        padding: '20px',
                                        border: `1px solid ${i === 0 ? 'rgba(16, 185, 129, 0.3)' : 'var(--glass-border)'}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onClick={() => setExpandedPlant(expandedPlant === plant.plantId ? null : plant.plantId)}
                                >
                                    {/* Rank badge */}
                                    <div style={{
                                        position: 'absolute',
                                        top: '12px',
                                        right: '15px',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: i < 3 ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        fontSize: '0.8rem',
                                        color: i < 3 ? '#fff' : 'var(--text-muted)'
                                    }}>
                                        {i + 1}
                                    </div>

                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600, paddingRight: '35px' }}>{plant.name}</h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('workforce.plantCardEfficiency', 'Efficiency')}</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: getEfficiencyColor(plant.efficiency) }}>{plant.efficiency}%</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('workforce.plantCardSopCoverage', 'SOP Coverage')}</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: plant.sopCoverage >= 80 ? '#3b82f6' : '#f59e0b' }}>{plant.sopCoverage}%</div>
                                        </div>
                                    </div>

                                    {/* Progress bar for efficiency */}
                                    <div style={{ marginTop: '12px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${Math.min(100, (plant.efficiency / 130) * 100)}%`,
                                            height: '100%',
                                            background: `linear-gradient(90deg, ${getEfficiencyColor(plant.efficiency)}88, ${getEfficiencyColor(plant.efficiency)})`,
                                            borderRadius: '4px',
                                            transition: 'width 0.8s ease'
                                        }} />
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        <span>{plant.completedWOs} {t('workforce.completedOf', 'completed /')} {plant.totalWOs} {t('workforce.total', 'total')}</span>
                                        <span>{plant.techCount} {t('workforce.technicians', 'technicians')}</span>
                                    </div>

                                    {expandedPlant === plant.plantId && (
                                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <InfoBlock label={t('workforce.infoAvgExpected', 'Avg Expected')} value={`${plant.avgExpected} ${t('workforce.hrs', 'hrs')}`} />
                                            <InfoBlock label={t('workforce.infoAvgActual', 'Avg Actual')} value={`${plant.avgActual} ${t('workforce.hrs', 'hrs')}`} valueColor={plant.avgActual <= plant.avgExpected ? '#10b981' : '#f59e0b'} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════ SOPS SECTION ═══════════════════════ */}
                {activeSection === 'sops' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Shield size={20} color="var(--primary)" /> {t('workforce.sopEffectivenessAnalysis', 'SOP Effectiveness Analysis')}
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {t('workforce.sopEffectivenessNote', 'Higher efficiency = procedure correlates with faster task completion')}
                            </span>
                        </div>

                        <div style={{ border: '1px solid var(--glass-border)', borderRadius: '10px', overflow: 'hidden' }}>
                            <table className="data-table" style={{ fontSize: '0.85rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                                    <tr>
                                        <th style={{ width: '40px' }}>#</th>
                                        <th>{t('workforce.procedureId', 'Procedure ID')}</th>
                                        <th style={{ textAlign: 'center' }}>{t('workforce.colTimesUsed', 'Times Used')}</th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colAvgExpected', 'Avg Expected')}</th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colAvgActual', 'Avg Actual')}</th>
                                        <th style={{ textAlign: 'center' }}>{t('workforce.colEfficiency', 'Efficiency')}</th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colPlants', 'Plants')}</th>
                                        <th className="hide-mobile" style={{ textAlign: 'center' }}>{t('workforce.colTechnicians', 'Technicians')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sopEffectiveness.map((sop, i) => (
                                        <tr key={sop.procId}>
                                            <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <FileText size={14} color="var(--primary)" />
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>{sop.procId}</span>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{sop.timesUsed}</td>
                                            <td className="hide-mobile" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{sop.avgExpected} {t('workforce.hrs', 'hrs')}</td>
                                            <td className="hide-mobile" style={{ textAlign: 'center', fontWeight: 500 }}>
                                                <span style={{ color: sop.avgActual <= sop.avgExpected ? '#10b981' : '#f59e0b' }}>
                                                    {sop.avgActual} {t('workforce.hrs', 'hrs')}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '3px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    background: `${getEfficiencyColor(sop.efficiency)}15`,
                                                    color: getEfficiencyColor(sop.efficiency),
                                                    border: `1px solid ${getEfficiencyColor(sop.efficiency)}30`
                                                }}>
                                                    {sop.efficiency >= 100 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                                    {sop.efficiency}%
                                                </span>
                                            </td>
                                            <td className="hide-mobile" style={{ textAlign: 'center' }}>{sop.plantCount}</td>
                                            <td className="hide-mobile" style={{ textAlign: 'center' }}>{sop.techCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* SOP Insight Card */}
                        <div style={{
                            background: 'rgba(99, 102, 241, 0.03)',
                            border: '1px solid rgba(99, 102, 241, 0.15)',
                            borderRadius: '14px',
                            padding: '20px'
                        }}>
                            <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} /> {t('workforce.keyInsight', 'Key Insight')}
                            </h4>
                            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.9rem' }}>
                                {sopEffectiveness.length > 0 ? (
                                    <>
                                        {t('workforce.sopInsightBestProcedure', 'The')} <strong style={{ color: 'var(--primary)' }}>{sopEffectiveness[0]?.procId}</strong> {t('workforce.sopInsightDeliversBest', 'procedure delivers the best efficiency at')} <strong style={{ color: '#10b981' }}>{sopEffectiveness[0]?.efficiency}%</strong>, {t('workforce.sopInsightUsedAcross', 'used across')} {sopEffectiveness[0]?.plantCount} {t('workforce.sopInsightPlantsByTechs', 'plants by')} {sopEffectiveness[0]?.techCount} {t('workforce.sopInsightTechnicians', 'technicians')}.
                                        {sopEffectiveness.length > 1 && (
                                            <> {t('workforce.sopInsightLeastEffective', 'The least effective procedure is')} <strong style={{ color: '#f59e0b' }}>{sopEffectiveness[sopEffectiveness.length - 1]?.procId}</strong> {t('workforce.sopInsightAt', 'at')} {sopEffectiveness[sopEffectiveness.length - 1]?.efficiency}%. {t('workforce.sopInsightConsiderReviewing', 'Consider reviewing and updating this SOP to improve completion times.')}</>
                                        )}
                                    </>
                                ) : (
                                    t('workforce.noSopDataAvailable', 'No SOP data available for analysis. Link procedures to work orders to enable effectiveness tracking.')
                                )}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Utility Components ──

function KPICard({ icon, label, value, color, subtitle }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '14px',
            padding: '20px',
            border: '1px solid var(--glass-border)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                background: `${color}08`,
                border: `1px solid ${color}15`
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <span style={{ color }}>{icon}</span>
                {label}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>{subtitle}</div>}
        </div>
    );
}

function InfoBlock({ label, value, valueColor }) {
    return (
        <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: valueColor || 'inherit' }}>{value}</div>
        </div>
    );
}
