// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Risk Scorecard
 * ==========================
 * Insurance and compliance risk score display widget. Renders the composite
 * Trier OS Risk Score (0–100) as an animated speedometer gauge with a
 * 12-month sparkline trend. Used by DashboardView and UnderwriterView.
 *
 * RISK SCORE SCALE:
 *   0–30    → Critical Risk (red)   — Immediate action required
 *   31–60   → Elevated Risk (amber) — Improvement plan needed
 *   61–80   → Moderate Risk (yellow) — Monitoring recommended
 *   81–100  → Low Risk (green)      — Well-managed facility
 *
 * KEY FEATURES:
 *   - SVG speedometer gauge: animated needle sweep on score change
 *   - 12-month sparkline: trend line showing score trajectory
 *   - Score breakdown: hover/tap gauge for factor-by-factor breakdown
 *   - Print: formatted risk summary for insurance submission
 *   - Refresh: re-fetch current score from risk scoring engine
 *
 * DATA SOURCES:
 *   GET /api/risk-scoring/score   — Current composite risk score + 12-month history
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, AlertTriangle, TrendingUp, RefreshCw, Printer } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

// ── SVG Speedometer Gauge ────────────────────────────────────────────────────
function SpeedometerGauge({ score = 0, size = 200 }) {
    const cx = size / 2;
    const cy = size / 2 + 10;
    const r = (size / 2) - 20;

    // Semi-circle arc: from 180° to 0° (left to right)
    const startAngle = Math.PI;       // 180°
    const endAngle = 0;               // 0°
    const sweepAngle = Math.PI;       // 180° total

    function polarToXY(angleDeg, radius) {
        const rad = (angleDeg * Math.PI) / 180;
        return {
            x: cx + radius * Math.cos(Math.PI - rad),
            y: cy - radius * Math.sin(Math.PI - rad)
        };
    }

    // Track arc (full 180°)
    const trackStart = polarToXY(0, r);
    const trackEnd = polarToXY(180, r);

    // Fill arc (0 → score mapped to 0° → 180°)
    const fillAngle = (score / 100) * 180;
    const fillEnd = polarToXY(fillAngle, r);
    const largeArc = fillAngle > 180 ? 1 : 0;

    // Needle angle
    const needleAngle = (score / 100) * 180;
    const needleLen = r - 10;
    const needleTip = polarToXY(needleAngle, needleLen);
    const needleBase = polarToXY(needleAngle, -10);

    // Color zones
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
    const gradId = `riskGrad_${size}`;

    // Tick marks
    const ticks = [0, 20, 40, 60, 80, 100];

    return (
        <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`} style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
            </defs>

            {/* Track */}
            <path
                d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
                fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} strokeLinecap="round"
            />

            {/* Gradient fill arc */}
            {score > 0 && (
                <path
                    d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`}
                    fill="none" stroke={`url(#${gradId})`} strokeWidth={14} strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
                />
            )}

            {/* Tick marks */}
            {ticks.map(t => {
                const inner = polarToXY((t / 100) * 180, r - 20);
                const outer = polarToXY((t / 100) * 180, r - 8);
                return (
                    <line key={t}
                        x1={inner.x} y1={inner.y}
                        x2={outer.x} y2={outer.y}
                        stroke="rgba(255,255,255,0.2)" strokeWidth={2}
                    />
                );
            })}

            {/* Needle */}
            <line
                x1={needleBase.x} y1={needleBase.y}
                x2={needleTip.x} y2={needleTip.y}
                stroke={color} strokeWidth={3} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
            <circle cx={cx} cy={cy} r={6} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />

            {/* Score text */}
            <text x={cx} y={cy - r + 28} textAnchor="middle" fill={color}
                style={{ fontSize: size * 0.22, fontWeight: 'bold', fontFamily: 'inherit' }}>
                {score}
            </text>
            <text x={cx} y={cy - r + 44} textAnchor="middle" fill="rgba(255,255,255,0.4)"
                style={{ fontSize: size * 0.07, fontFamily: 'inherit' }}>
                / 100
            </text>

            {/* Zone labels */}
            <text x={trackStart.x - 4} y={trackStart.y + 14} textAnchor="end" fill="#ef4444"
                style={{ fontSize: 9, fontFamily: 'inherit' }}>AT RISK</text>
            <text x={trackEnd.x + 4} y={trackEnd.y + 14} textAnchor="start" fill="#10b981"
                style={{ fontSize: 9, fontFamily: 'inherit' }}>GOOD</text>
        </svg>
    );
}

// ── Sparkline Chart ───────────────────────────────────────────────────────────
function Sparkline({ data = [], width = 260, height = 48 }) {
    if (!data.length) {
        return (
            <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>No history yet</span>
            </div>
        );
    }

    const scores = data.map(d => d.Score || 0);
    const min = Math.max(0, Math.min(...scores) - 5);
    const max = Math.min(100, Math.max(...scores) + 5);
    const range = max - min || 1;
    const pad = { x: 6, y: 6 };
    const W = width - pad.x * 2;
    const H = height - pad.y * 2;

    const points = scores.map((s, i) => ({
        x: pad.x + (i / Math.max(scores.length - 1, 1)) * W,
        y: pad.y + H - ((s - min) / range) * H
    }));

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    const area = `M ${points[0].x},${height} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${points[points.length - 1].x},${height} Z`;
    const lastScore = scores[scores.length - 1];
    const color = lastScore >= 80 ? '#10b981' : lastScore >= 60 ? '#f59e0b' : '#ef4444';

    return (
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
            </defs>
            {/* Area fill */}
            <path d={area} fill="url(#sparkGrad)" />
            {/* Line */}
            <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* Last point dot */}
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                r={3} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        </svg>
    );
}

// ── Factor Row ────────────────────────────────────────────────────────────────
function FactorRow({ label, value, impact, severity }) {
    const color = severity === 'bonus' ? '#10b981' :
        severity === 'high' ? '#ef4444' :
        severity === 'medium' ? '#f59e0b' :
        severity === 'ok' ? '#10b981' : 'var(--text-muted)';
    const impactText = impact > 0 ? `+${impact}` : impact < 0 ? `${impact}` : '0';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', minWidth: 50, textAlign: 'right' }}>{value}</span>
            <span style={{
                fontSize: '0.75rem', fontWeight: 700,
                color: impact > 0 ? '#10b981' : impact < 0 ? '#ef4444' : 'rgba(255,255,255,0.3)',
                minWidth: 36, textAlign: 'right'
            }}>{impactText} pts</span>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RiskScorecard({ plantId, plantLabel, compact = false, onPrint }) {
    const { t } = useTranslation();
    const [scoreData, setScoreData] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const hdrs = {
        'x-plant-id': plantId
    };

    const fetchScore = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const plantQ = plantId ? `?plantId=${plantId}` : '';
            const [scoreRes, histRes] = await Promise.all([
                fetch(`/api/risk-scoring${plantQ}`, { headers: hdrs }),
                fetch(`/api/risk-scoring/history${plantQ}`, { headers: hdrs })
            ]);
            setScoreData(await scoreRes.json());
            const h = await histRes.json();
            setHistory(Array.isArray(h) ? h : []);
        } catch (err) {
            console.error('RiskScorecard fetch error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [plantId]);

    useEffect(() => { fetchScore(); }, [fetchScore]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
    );

    if (!scoreData) return null;

    const { score, grade, status, factors = [] } = scoreData;
    const gradeColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

    if (compact) {
        // Compact version for dashboard tiles
        return (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <SpeedometerGauge score={score} size={140} />
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: gradeColor, marginTop: 4 }}>
                    Grade {grade} — {status}
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <ShieldCheck size={22} color={gradeColor} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff' }}>Risk Score</h3>
                <span style={{
                    marginLeft: 'auto', padding: '3px 12px', borderRadius: 20,
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    background: `${gradeColor}22`, color: gradeColor, border: `1px solid ${gradeColor}44`
                }}>{status}</span>
                {onPrint && (
                    <button onClick={onPrint} className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, fontSize: '0.75rem' }} title="Print Evidence Packet">
                        <Printer size={13} /> Print
                    </button>
                )}
                <button onClick={() => fetchScore(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Refresh score">
                    <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Gauge Column */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <SpeedometerGauge score={score} size={200} />
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Grade</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</div>
                        </div>
                        <div style={{ width: 1, background: 'var(--glass-border)' }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Plant</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff', lineHeight: 1.2, maxWidth: 100 }}>{plantLabel || plantId || 'Enterprise'}</div>
                        </div>
                    </div>

                    {/* 12-month sparkline */}
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <TrendingUp size={13} color="var(--text-muted)" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>12-Month Trend</span>
                        </div>
                        <Sparkline data={history} width={200} height={48} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>
                            <span>{history.length > 0 ? new Date(history[0].ScoredAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '—'}</span>
                            <span>Now</span>
                        </div>
                    </div>
                </div>

                {/* Factors Column */}
                <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                        Score Breakdown
                    </div>
                    {factors.map((f, i) => (
                        <FactorRow key={i} label={f.label} value={f.value} impact={f.impact} severity={f.severity} />
                    ))}
                    <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                        Calculated: {scoreData.calculatedAt ? new Date(scoreData.calculatedAt).toLocaleString() : '—'}
                    </div>
                </div>
            </div>
        </div>
    );
}
