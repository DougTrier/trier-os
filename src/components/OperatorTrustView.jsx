// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Brain, ShieldAlert, CheckCircle, XCircle, Search, RefreshCw, 
    TrendingUp, AlertTriangle, Activity, Settings, ChevronDown, MessageSquare 
} from 'lucide-react';

const makeAPI = (plantId) => async (path, options = {}) => {
    const headers = {
        'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        ...options.headers
    };
    if (options.body && typeof options.body !== 'string') {
        options.body = JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, { ...options, headers });
    return res;
};

// Guard 1 — EmittedPayload parsing
function parsePayload(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
        return null;
    } catch {
        return null;
    }
}

// Guard 4 — Metrics null handling
const fmtRate = (rate) =>
    (rate !== null && rate !== undefined && !isNaN(rate))
        ? `${Math.round(rate * 100)}%`
        : '—';

export default function OperatorTrustView({ plantId }) {
    const API = useMemo(() => makeAPI(plantId), [plantId]);

    const [tab, setTab] = useState('active'); // 'active' | 'history' | 'metrics'
    const [recommendations, setRecommendations] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [metricsData, setMetricsData] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Filters & Pagination
    const [typeFilter, setTypeFilter] = useState(''); // '' = all types
    const [offset, setOffset] = useState(0);
    const [metricsDays, setMetricsDays] = useState(90);

    // Expansion & Action State
    const [expandedId, setExpandedId] = useState(null);
    const [expandedDetail, setExpandedDetail] = useState(null);
    const [feedbackState, setFeedbackState] = useState({}); // { [recId]: { mode, reasonCode, annotation, linkedWoId, done: boolean, action: string } }
    
    // Guard 2 — Feedback double submission
    const [submittingFeedback, setSubmittingFeedback] = useState({}); // { [recId]: boolean }

    const TYPES = ['PREDICTIVE_FORECAST', 'RISK_SCORE', 'VIBRATION_ALERT'];

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: 20, offset });
            if (plantId && plantId !== 'all_sites') params.append('plantId', plantId);
            if (typeFilter) params.append('type', typeFilter);

            const res = await API(`/api/operator-trust/recommendations?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setRecommendations(data.recommendations || []);
                setTotalCount(data.count || 0);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = async () => {
        try {
            const params = new URLSearchParams({ days: metricsDays });
            if (plantId && plantId !== 'all_sites') params.append('plantId', plantId);
            const res = await API(`/api/operator-trust/metrics?${params.toString()}`);
            if (res.ok) {
                setMetricsData(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchDetail = async (id) => {
        try {
            const res = await API(`/api/operator-trust/recommendations/${id}`);
            if (res.ok) setExpandedDetail(await res.json());
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (tab === 'active' || tab === 'history') {
            fetchRecommendations();
        } else if (tab === 'metrics') {
            fetchMetrics();
        }
    }, [tab, API, typeFilter, offset, metricsDays]);

    // Guard 2 & Guard 3
    const submitFeedback = async (recId, body) => {
        if (submittingFeedback[recId]) return; // idempotency guard
        setSubmittingFeedback(prev => ({ ...prev, [recId]: true }));
        try {
            const res = await fetch('/api/operator-trust/feedback', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' 
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                setFeedbackState(prev => ({ ...prev, [recId]: { done: true, action: body.action } }));
                setRecommendations(prev =>
                    prev.map(r => r.RecommendationID === recId
                        ? { ...r, feedbackCount: (r.feedbackCount || 0) + 1 }
                        : r
                    )
                );
                if (window.trierToast) window.trierToast.success('Feedback recorded');
            } else {
                // leave feedbackState unchanged — buttons stay visible       
                if (window.trierToast) window.trierToast.error('Failed to submit feedback');
            }
        } catch {
            if (window.trierToast) window.trierToast.error('Request failed'); 
        } finally {
            setSubmittingFeedback(prev => ({ ...prev, [recId]: false }));     
        }
    };

    const handleRecordOutcome = async (recId, outcomeType, matchedWoId, evidenceNote) => {
        try {
            const res = await API('/api/operator-trust/outcomes', {
                method: 'POST',
                body: { recommendationId: recId, outcomeType, matchedWoId, evidenceNote }
            });
            if (res.ok) {
                fetchDetail(recId);
                if (window.trierToast) window.trierToast.success('Outcome recorded');
            }
        } catch (err) {
            console.error(err);
            if (window.trierToast) window.trierToast.error('Failed to record outcome');
        }
    };

    const seedTestRecommendation = async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        const body = {
            type: form.get('type'),
            plantId: plantId || 'Demo_Plant_1',
            assetId: form.get('assetId'),
            recommendedAction: form.get('action'),
            confidenceScore: parseFloat(form.get('confidenceScore') || 0.95),
            confidenceBand: form.get('confidenceBand'),
            emittedPayload: {
                explanation: "Bearing temperature has trended upward for 72 consecutive hours, exceeding the plant baseline by 18%. Recommend inspection before next scheduled maintenance window.",
                sensor: "temp_q11_bearing",
                baseline_c: 72,
                current_c: 85
            }
        };

        try {
            const res = await API('/api/operator-trust/recommendations', { method: 'POST', body });
            if (res.ok) {
                if (window.trierToast) window.trierToast.success('Seed successful');
                fetchRecommendations();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const renderTypeIcon = (type, size = 16) => {
        if (type === 'PREDICTIVE_FORECAST') return <TrendingUp size={size} />;
        if (type === 'RISK_SCORE') return <AlertTriangle size={size} />;
        if (type === 'VIBRATION_ALERT') return <Activity size={size} />;
        return <Brain size={size} />;
    };

    const getConfidenceStyles = (band) => {
        if (band === 'HIGH') return { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' };
        if (band === 'MEDIUM') return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' };
        if (band === 'LOW') return { background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' };
        return { background: 'rgba(255,255,255,0.1)', color: '#cbd5e1' };
    };

    return (
        <div className="module-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Brain className="text-indigo-400" size={28} />
                        Operator Trust Layer
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                        Review system recommendations, provide operator feedback, and track AI accuracy.
                    </p>
                </div>
                
                {/* Tabs */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
                    {['active', 'history', 'metrics'].map(t => (
                        <button 
                            key={t}
                            onClick={() => { setTab(t); setOffset(0); }}
                            style={{
                                padding: '8px 16px', background: tab === t ? '#4f46e5' : 'transparent', border: 'none', 
                                color: tab === t ? '#fff' : '#94a3b8', borderRadius: '6px', cursor: 'pointer',
                                fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize', fontSize: '0.9rem'
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            {tab === 'active' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => { setTypeFilter(''); setOffset(0); }}
                            style={{ padding: '6px 12px', background: typeFilter === '' ? 'rgba(79,70,229,0.2)' : 'rgba(255,255,255,0.05)', color: typeFilter === '' ? '#818cf8' : '#cbd5e1', border: `1px solid ${typeFilter === '' ? '#818cf8' : 'transparent'}`, borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                            ALL
                        </button>
                        {TYPES.map(type => (
                            <button 
                                key={type}
                                onClick={() => { setTypeFilter(type); setOffset(0); }}
                                style={{ padding: '6px 12px', background: typeFilter === type ? 'rgba(79,70,229,0.2)' : 'rgba(255,255,255,0.05)', color: typeFilter === type ? '#818cf8' : '#cbd5e1', border: `1px solid ${typeFilter === type ? '#818cf8' : 'transparent'}`, borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {renderTypeIcon(type, 14)} {type.replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    {recommendations.length === 0 && !loading && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No active recommendations found.</div>
                    )}

                    {recommendations.map(rec => {
                        const payload = parsePayload(rec.EmittedPayload);
                        const explanation = payload?.explanation ?? null;
                        
                        const state = feedbackState[rec.RecommendationID] || {};
                        const hasFeedback = rec.feedbackCount > 0 || state.done;
                        
                        return (
                            <div key={rec.RecommendationID} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, ...getConfidenceStyles(rec.ConfidenceBand) }}>
                                            {rec.ConfidenceBand} ({Math.round(rec.ConfidenceScore * 100)}%)
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                            {renderTypeIcon(rec.Type, 14)} {rec.Type}
                                        </span>
                                    </div>
                                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{new Date(rec.EmittedAt).toLocaleString()}</span>
                                </div>
                                
                                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.round(rec.ConfidenceScore * 100)}%`, height: '100%', background: getConfidenceStyles(rec.ConfidenceBand).color }}></div>
                                </div>

                                <div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#e2e8f0' }}>Asset: {rec.AssetID}</h3>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', lineHeight: 1.5 }}>
                                        {rec.RecommendedAction}
                                    </p>
                                    {explanation !== null && (
                                        <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                            "{explanation}"
                                        </p>
                                    )}
                                </div>

                                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                                    {hasFeedback ? (
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(52,211,153,0.1)', color: '#34d399', padding: '6px 12px', borderRadius: '4px', fontSize: '0.85rem' }}>
                                            <CheckCircle size={16} /> Feedback recorded ({state.action || 'PENDING'})
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <button 
                                                onClick={() => submitFeedback(rec.RecommendationID, { recommendationId: rec.RecommendationID, action: 'ACCEPT' })}
                                                disabled={!!submittingFeedback[rec.RecommendationID]}
                                                style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, opacity: submittingFeedback[rec.RecommendationID] ? 0.5 : 1 }}
                                            >
                                                ✓ ACCEPT
                                            </button>
                                            
                                            {state.mode === 'reject' ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <select 
                                                        value={state.reasonCode || ''} 
                                                        onChange={(e) => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: { ...state, reasonCode: e.target.value } }))}
                                                        style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid #ef4444', padding: '6px', borderRadius: '4px', fontSize: '0.85rem' }}
                                                    >
                                                        <option value="">Select Reason...</option>
                                                        <option value="FALSE_POSITIVE">False Positive</option>
                                                        <option value="ALREADY_KNOWN">Already Known</option>
                                                        <option value="OUT_OF_SCOPE">Out of Scope</option>
                                                        <option value="DATA_ERROR">Data Error</option>
                                                    </select>
                                                    <button onClick={() => submitFeedback(rec.RecommendationID, { recommendationId: rec.RecommendationID, action: 'REJECT', reasonCode: state.reasonCode })} disabled={!state.reasonCode || !!submittingFeedback[rec.RecommendationID]} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', opacity: (!state.reasonCode || !!submittingFeedback[rec.RecommendationID]) ? 0.5 : 1 }}>Confirm Reject</button>
                                                    <button onClick={() => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: {} }))} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: { mode: 'reject' } }))} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                    ✗ REJECT <ChevronDown size={14} />
                                                </button>
                                            )}

                                            {state.mode === 'annotate' ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                                                    <input type="text" placeholder="Add annotation..." style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', fontSize: '0.85rem' }} onChange={(e) => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: { ...state, annotation: e.target.value } }))} />
                                                    <input type="text" placeholder="Link WO" style={{ width: '100px', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', fontSize: '0.85rem' }} onChange={(e) => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: { ...state, linkedWoId: e.target.value } }))} />
                                                    <button onClick={() => submitFeedback(rec.RecommendationID, { recommendationId: rec.RecommendationID, action: 'ANNOTATE', annotation: state.annotation, linkedWoId: state.linkedWoId })} disabled={!!submittingFeedback[rec.RecommendationID]} style={{ background: '#475569', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', opacity: !!submittingFeedback[rec.RecommendationID] ? 0.5 : 1 }}>Submit</button>
                                                    <button onClick={() => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: {} }))} style={{ background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                state.mode !== 'reject' && (
                                                    <button onClick={() => setFeedbackState(prev => ({ ...prev, [rec.RecommendationID]: { mode: 'annotate' } }))} style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #475569', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        <MessageSquare size={14} /> ANNOTATE
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing {recommendations.length} of {totalCount}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setOffset(o => Math.max(0, o - 20))} disabled={offset === 0} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>PREV</button>
                            <button onClick={() => setOffset(o => o + 20)} disabled={offset + 20 >= totalCount} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>NEXT</button>
                        </div>
                    </div>

                    {/* Dev Seed Panel */}
                    {import.meta.env.DEV && (
                        <details style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px dashed #4f46e5', marginTop: '20px' }}>
                            <summary style={{ cursor: 'pointer', color: '#818cf8', fontSize: '0.85rem', fontWeight: 600 }}>⚙ Add Test Recommendation (Dev Only)</summary>
                            <form onSubmit={seedTestRecommendation} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px' }}>
                                <select name="type" className="input" defaultValue="VIBRATION_ALERT">
                                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select name="confidenceBand" className="input" defaultValue="HIGH">
                                    <option value="HIGH">HIGH (0.95)</option>
                                    <option value="MEDIUM">MEDIUM (0.65)</option>
                                    <option value="LOW">LOW (0.35)</option>
                                </select>
                                <input type="hidden" name="confidenceScore" value="0.95" />
                                <input name="assetId" placeholder="Asset ID" defaultValue="AST00001" className="input" />
                                <input name="action" placeholder="Recommended Action" defaultValue="Schedule bearing inspection — temperature trend +18% over 72h" className="input" style={{ flex: '1 1 300px' }} />
                                <button type="submit" className="btn-primary">Seed Recommendation</button>
                            </form>
                        </details>
                    )}
                </div>
            )}

            {tab === 'history' && (
                <div style={{ flex: 1, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Timestamp</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Type</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Asset</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Action</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Confidence</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Feedback</th>
                                <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recommendations.map(rec => (
                                <React.Fragment key={rec.RecommendationID}>
                                    <tr 
                                        onClick={() => {
                                            setExpandedId(expandedId === rec.RecommendationID ? null : rec.RecommendationID);
                                            if (expandedId !== rec.RecommendationID) fetchDetail(rec.RecommendationID);
                                        }}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: expandedId === rec.RecommendationID ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                                        className="hover:bg-white/5"
                                    >
                                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{new Date(rec.EmittedAt).toLocaleString()}</td>
                                        <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{renderTypeIcon(rec.Type, 14)} {rec.Type}</div></td>
                                        <td style={{ padding: '12px 16px' }}>{rec.AssetID}</td>
                                        <td style={{ padding: '12px 16px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.RecommendedAction}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: getConfidenceStyles(rec.ConfidenceBand).color }}>{rec.ConfidenceBand}</span>
                                                <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                                                    <div style={{ width: `${Math.round(rec.ConfidenceScore * 100)}%`, height: '100%', background: getConfidenceStyles(rec.ConfidenceBand).color }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {rec.feedbackCount > 0 ? <span style={{ color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '2px 6px', borderRadius: '4px' }}>RECORDED</span> : <span style={{ color: '#94a3b8' }}>Pending</span>}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {/* Outcome logic (need detail to see it unless it's in list) */}
                                            <span style={{ color: '#94a3b8' }}>—</span>
                                        </td>
                                    </tr>
                                    {expandedId === rec.RecommendationID && expandedDetail && (
                                        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                            <td colSpan={7} style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    <div>
                                                        <h4 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>Full Payload</h4>
                                                        <pre style={{ margin: 0, padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#cbd5e1', overflowX: 'auto' }}>
                                                            {expandedDetail.recommendation?.EmittedPayload}
                                                        </pre>
                                                    </div>
                                                    
                                                    <div>
                                                        <h4 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>Feedback History</h4>
                                                        {expandedDetail.feedback?.length > 0 ? (
                                                            <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1' }}>
                                                                {expandedDetail.feedback.map(f => (
                                                                    <li key={f.FeedbackID} style={{ marginBottom: '4px' }}>
                                                                        <strong>{f.Action}</strong> by {f.Operator} on {new Date(f.FeedbackAt).toLocaleString()}
                                                                        {f.ReasonCode && ` — Reason: ${f.ReasonCode}`}
                                                                        {f.Annotation && ` — Note: ${f.Annotation}`}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : <div style={{ color: '#64748b' }}>No feedback recorded yet.</div>}
                                                    </div>

                                                    <div>
                                                        <h4 style={{ margin: '0 0 8px 0', color: '#e2e8f0' }}>Outcome</h4>
                                                        {expandedDetail.outcome ? (
                                                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px' }}>
                                                                <strong>{expandedDetail.outcome.OutcomeType}</strong> recorded by {expandedDetail.outcome.RecordedBy} on {new Date(expandedDetail.outcome.RecordedAt).toLocaleString()}
                                                                {expandedDetail.outcome.EvidenceNote && <div style={{ marginTop: '4px' }}>Evidence: {expandedDetail.outcome.EvidenceNote}</div>}
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Record Outcome:</span>
                                                                <select id={`outcomeType-${rec.RecommendationID}`} style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px', borderRadius: '4px' }}>
                                                                    <option value="VALIDATED">VALIDATED</option>
                                                                    <option value="REFUTED">REFUTED</option>
                                                                    <option value="EXPIRED">EXPIRED</option>
                                                                    <option value="INCONCLUSIVE">INCONCLUSIVE</option>
                                                                </select>
                                                                <input id={`outcomeWo-${rec.RecommendationID}`} type="text" placeholder="WO Ref" style={{ width: '100px', padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff' }} />
                                                                <input id={`outcomeEvidence-${rec.RecommendationID}`} type="text" placeholder="Evidence note..." style={{ flex: 1, padding: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff' }} />
                                                                <button 
                                                                    className="btn-primary"
                                                                    onClick={() => handleRecordOutcome(
                                                                        rec.RecommendationID,
                                                                        document.getElementById(`outcomeType-${rec.RecommendationID}`).value,
                                                                        document.getElementById(`outcomeWo-${rec.RecommendationID}`).value,
                                                                        document.getElementById(`outcomeEvidence-${rec.RecommendationID}`).value
                                                                    )}
                                                                >
                                                                    Submit
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'metrics' && metricsData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {[30, 90, 180, 365].map(d => (
                            <button 
                                key={d} onClick={() => setMetricsDays(d)}
                                style={{ padding: '6px 16px', background: metricsDays === d ? '#4f46e5' : 'rgba(255,255,255,0.05)', color: metricsDays === d ? '#fff' : '#cbd5e1', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                {d} Days
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div className="stat-card">
                            <div className="stat-label">Total Recommendations</div>
                            <div className="stat-value">{metricsData.overall?.total || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Validated</div>
                            <div className="stat-value text-green-400">{metricsData.overall?.validated || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Refuted</div>
                            <div className="stat-value text-red-400">{metricsData.overall?.refuted || 0}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Validation Rate</div>
                            <div className="stat-value text-indigo-400">
                                {fmtRate(metricsData.overall?.validationRate)}
                            </div>
                        </div>
                    </div>

                    <h3 style={{ margin: '20px 0 0 0', color: '#e2e8f0' }}>Breakdown by Type</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        {TYPES.map(type => {
                            const stats = metricsData?.byType?.[type] ?? { total: 0, validated: 0, refuted: 0, expired: 0, inconclusive: 0, validationRate: null };
                            const total = stats.total;
                            const vPct = total ? (stats.validated / total) * 100 : 0;
                            const rPct = total ? (stats.refuted / total) * 100 : 0;
                            const ePct = total ? (stats.expired / total) * 100 : 0;

                            return (
                                <div key={type} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 600, marginBottom: '16px' }}>
                                        {renderTypeIcon(type, 18)} {type.replace('_', ' ')}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#94a3b8' }}>Total</span>
                                        <span style={{ color: '#fff', fontWeight: 600 }}>{total}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                        <span style={{ color: '#94a3b8' }}>Validation Rate</span>
                                        <span style={{ color: '#34d399', fontWeight: 600 }}>{fmtRate(stats.validationRate)}</span>
                                    </div>
                                    
                                    {total > 0 ? (
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                                            <div style={{ width: `${vPct}%`, background: '#34d399' }} title={`Validated: ${stats.validated}`}></div>
                                            <div style={{ width: `${rPct}%`, background: '#f87171' }} title={`Refuted: ${stats.refuted}`}></div>
                                            <div style={{ width: `${ePct}%`, background: '#94a3b8' }} title={`Expired: ${stats.expired}`}></div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '8px' }}>No data in window</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
