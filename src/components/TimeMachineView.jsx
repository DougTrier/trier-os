// Copyright © 2026 Trier OS. All Rights Reserved.
/**
 * Trier OS — Deterministic Time Machine View
 * ============================================
 * Timeline inspection, snapshot management, and shadow branch simulation.
 * Restricted to creator and it_admin roles (enforced server-side).
 *
 * API DEPENDENCIES:
 *   GET  /api/time-machine/timeline
 *   GET  /api/time-machine/snapshots
 *   GET  /api/time-machine/seek
 *   POST /api/time-machine/snapshot
 *   POST /api/time-machine/branch
 *   GET  /api/time-machine/branch/:branchId/diff
 *   POST /api/time-machine/branch/:branchId/simulate
 *   DELETE /api/time-machine/branch/:branchId
 */

import React, { useState, useEffect } from 'react';
import { GitBranch, Clock, Camera, ChevronDown, ChevronRight, Play, Trash2, RefreshCw, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';

export default function TimeMachineView({ plantId, plantLabel }) {
    const [activeTab, setActiveTab] = useState('timeline');

    // Timeline state
    const [events, setEvents] = useState([]);
    const [timelineFilter, setTimelineFilter] = useState({ from: '', to: '', aggregateType: 'All' });
    const [timelinePage, setTimelinePage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [expandedEventId, setExpandedEventId] = useState(null);
    const [timelineLoading, setTimelineLoading] = useState(false);

    // Snapshots state
    const [snapshots, setSnapshots] = useState([]);
    const [seekTimestamp, setSeekTimestamp] = useState('');
    const [seekResult, setSeekResult] = useState(null);
    const [creatingSnapshot, setCreatingSnapshot] = useState(false);

    // Branches state
    const [branches, setBranches] = useState([]);
    const [branchDiffs, setBranchDiffs] = useState({});
    const [simulateForms, setSimulateForms] = useState({});
    const [simulating, setSimulating] = useState(false);
    const [simulateResults, setSimulateResults] = useState({});

    // === TIMELINE FETCH ===
    const fetchTimeline = async (page = 1, append = false) => {
        setTimelineLoading(true);
        try {
            const params = new URLSearchParams({ plantId, page, limit: 100 });
            if (timelineFilter.from) params.append('from', timelineFilter.from);
            if (timelineFilter.to) params.append('to', timelineFilter.to);
            if (timelineFilter.aggregateType && timelineFilter.aggregateType !== 'All') {
                params.append('aggregateType', timelineFilter.aggregateType);
            }

            const res = await fetch(`/api/time-machine/timeline?${params.toString()}`);
            const data = await res.json();
            if (res.ok) {
                setEvents(append ? [...events, ...data.events] : data.events);
                setHasMore(data.hasMore);
                setTimelinePage(page);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setTimelineLoading(false);
        }
    };

    useEffect(() => {
        if (plantId && activeTab === 'timeline') {
            fetchTimeline(1, false);
        }
    }, [plantId, activeTab]);

    // === SNAPSHOTS FETCH ===
    const fetchSnapshots = async () => {
        try {
            const res = await fetch(`/api/time-machine/snapshots?plantId=${plantId}`);
            const data = await res.json();
            if (res.ok && data.snapshots) {
                setSnapshots(data.snapshots);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (plantId && activeTab === 'snapshots') {
            fetchSnapshots();
        }
    }, [plantId, activeTab]);

    // Actions
    const handleCreateSnapshot = async () => {
        setCreatingSnapshot(true);
        try {
            const res = await fetch('/api/time-machine/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plantId })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`Snapshot created — EventWatermark: ${data.snapshot.EventWatermark}`);
                fetchSnapshots();
            } else {
                alert(data.error || 'Failed to create snapshot');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setCreatingSnapshot(false);
        }
    };

    const handleSeek = async (ts) => {
        try {
            const res = await fetch(`/api/time-machine/seek?plantId=${plantId}&timestamp=${ts}`);
            const data = await res.json();
            if (res.ok) {
                setSeekResult(data);
            } else {
                alert(data.error || 'Seek failed');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleBranch = async (fromTimestamp) => {
        try {
            const res = await fetch('/api/time-machine/branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plantId, fromTimestamp })
            });
            const data = await res.json();
            if (res.ok) {
                setBranches([{ ...data, timestamp: fromTimestamp }, ...branches]);
                setActiveTab('branches');
            } else {
                alert(data.error || 'Failed to branch');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleViewDiff = async (branchId) => {
        if (branchDiffs[branchId]) {
            const diffs = { ...branchDiffs };
            delete diffs[branchId];
            setBranchDiffs(diffs);
            return;
        }
        try {
            const res = await fetch(`/api/time-machine/branch/${branchId}/diff`);
            const data = await res.json();
            if (res.ok) {
                setBranchDiffs({ ...branchDiffs, [branchId]: data.divergedEvents });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSimulate = async (branchId) => {
        const form = simulateForms[branchId] || {};
        if (!form.payload) {
            alert('Payload is required');
            return;
        }
        let payloadObj;
        try {
            payloadObj = JSON.parse(form.payload);
        } catch (e) {
            alert('Invalid JSON payload');
            return;
        }

        setSimulating(true);
        try {
            const res = await fetch(`/api/time-machine/branch/${branchId}/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: form.table || 'Asset',
                    operation: form.operation || 'UPDATE',
                    payload: payloadObj
                })
            });
            const data = await res.json();
            if (res.ok) {
                setSimulateResults({ ...simulateResults, [branchId]: data.simulatedEvent });
                const diffs = { ...branchDiffs };
                delete diffs[branchId];
                setBranchDiffs(diffs);
            } else {
                alert(data.error || 'Simulate failed');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSimulating(false);
        }
    };

    const handleDeleteBranch = async (branchId) => {
        if (!window.confirm('Are you sure you want to delete this shadow branch?')) return;
        try {
            const res = await fetch(`/api/time-machine/branch/${branchId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setBranches(branches.filter(b => b.branchId !== branchId));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getEventBadge = (type) => {
        if (type === 'INSERT') return { bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
        if (type === 'UPDATE') return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
        if (type === 'DELETE') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
        return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' };
    };

    const renderDiffCell = (key, val, isDifferent) => {
        const style = isDifferent ? { background: 'rgba(245,158,11,0.12)', borderLeft: '3px solid #f59e0b', padding: '2px 4px' } : { padding: '2px 4px' };
        return (
            <div key={key} style={style}>
                <span style={{ color: '#94a3b8' }}>{key}: </span>
                <span style={{ color: '#f1f5f9' }}>{JSON.stringify(val)}</span>
            </div>
        );
    };

    const renderDiffPanel = (event) => {
        const before = event.PayloadBefore || {};
        const after = event.PayloadAfter || {};
        const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

        return (
            <div style={{ padding: '16px', background: 'rgba(15,23,42,0.6)', borderTop: '1px solid #334155' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontFamily: 'monospace', fontSize: '0.85rem', maxHeight: '300px', overflowY: 'auto' }}>
                    <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ color: '#94a3b8', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '8px', fontWeight: 600 }}>Before</div>
                        {event.EventType === 'INSERT' ? <div style={{ color: '#64748b', fontStyle: 'italic' }}>— New record —</div> :
                            allKeys.map(k => renderDiffCell(k, before[k], before[k] !== after[k]))
                        }
                    </div>
                    <div style={{ background: '#1e293b', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ color: '#94a3b8', borderBottom: '1px solid #334155', paddingBottom: '8px', marginBottom: '8px', fontWeight: 600 }}>After</div>
                        {event.EventType === 'DELETE' ? <div style={{ color: '#64748b', fontStyle: 'italic' }}>— Record deleted —</div> :
                            allKeys.map(k => renderDiffCell(k, after[k], before[k] !== after[k]))
                        }
                    </div>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" onClick={async () => {
                        const res = await fetch(`/api/time-machine/seek?plantId=${plantId}&timestamp=${event.Timestamp}`);
                        const data = await res.json();
                        if (!res.ok || !data.canSeek) {
                            alert(data.reason || 'Cannot seek before this event');
                        } else {
                            if (window.confirm(`Nearest anchor: ${data.snapshot.SnapshotAt} (${data.eventsToReplay} events to replay). Proceed?`)) {
                                handleBranch(event.Timestamp);
                            }
                        }
                    }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <GitBranch size={16} /> Branch From Before This Event
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 8px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(139, 92, 246, 0.35)' }}>
                    <Layers size={26} color="#fff" />
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>Deterministic Time Machine</h1>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{plantLabel}</p>
                </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid #334155' }}>
                {['timeline', 'snapshots', 'branches'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 20px', background: 'transparent', border: 'none', cursor: 'pointer',
                            color: activeTab === tab ? '#8b5cf6' : '#94a3b8',
                            borderBottom: activeTab === tab ? '2px solid #8b5cf6' : '2px solid transparent',
                            fontWeight: activeTab === tab ? 600 : 500, fontSize: '0.9rem', textTransform: 'capitalize'
                        }}
                    >
                        {tab === 'branches' ? 'Active Branches' : tab}
                    </button>
                ))}
            </div>

            {activeTab === 'timeline' && (
                <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>From Date</label>
                            <input type="datetime-local" value={timelineFilter.from} onChange={e => setTimelineFilter({ ...timelineFilter, from: e.target.value })} className="form-input" style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>To Date</label>
                            <input type="datetime-local" value={timelineFilter.to} onChange={e => setTimelineFilter({ ...timelineFilter, to: e.target.value })} className="form-input" style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Aggregate Type</label>
                            <select value={timelineFilter.aggregateType} onChange={e => setTimelineFilter({ ...timelineFilter, aggregateType: e.target.value })} className="form-input" style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }}>
                                {['All', 'Asset', 'WorkOrder', 'WorkOrderTask', 'MaintenanceSchedule', 'Part', 'PurchaseOrder', 'ProductionLog', 'EnergyReading'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <button className="btn-secondary" onClick={() => fetchTimeline(1, false)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '35px' }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>

                    <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#1e293b', textAlign: 'left', color: '#94a3b8' }}>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>ID</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Timestamp</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Table</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Aggregate</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Event</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map(ev => {
                                    const badge = getEventBadge(ev.EventType);
                                    const expanded = expandedEventId === ev.EventID;
                                    return (
                                        <React.Fragment key={ev.EventID}>
                                            <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', cursor: 'pointer' }} onClick={() => setExpandedEventId(expanded ? null : ev.EventID)}>
                                                <td style={{ padding: '10px', color: '#94a3b8' }}>{ev.EventID}</td>
                                                <td style={{ padding: '10px', color: '#f1f5f9' }}>{new Date(ev.Timestamp).toLocaleString()}</td>
                                                <td style={{ padding: '10px', color: '#cbd5e1' }}>{ev.TableName}</td>
                                                <td style={{ padding: '10px', color: '#cbd5e1' }}>{ev.AggregateType} {ev.AggregateID ? `#${ev.AggregateID}` : ''}</td>
                                                <td style={{ padding: '10px' }}>
                                                    <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem' }}>
                                                        {ev.EventType}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px', color: '#64748b', textAlign: 'right' }}>
                                                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan="6" style={{ padding: 0 }}>
                                                        {renderDiffPanel(ev)}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {events.length === 0 && !timelineLoading && (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No events found for this filter.</div>
                        )}
                        {timelineLoading && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}><RefreshCw className="spin" size={20} /></div>
                        )}
                    </div>
                    {hasMore && (
                        <button className="btn-secondary" onClick={() => fetchTimeline(timelinePage + 1, true)} style={{ alignSelf: 'center' }}>
                            Load More
                        </button>
                    )}
                </div>
            )}

            {activeTab === 'snapshots' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn-primary" onClick={handleCreateSnapshot} disabled={creatingSnapshot} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Camera size={16} /> Create Snapshot Now
                        </button>
                    </div>
                    
                    <div className="glass-card" style={{ padding: '20px' }}>
                        <h2 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', color: '#f1f5f9' }}>Available Snapshots</h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#1e293b', textAlign: 'left', color: '#94a3b8' }}>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>SnapshotAt</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Watermark (EventID)</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Size</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Hash</th>
                                    <th style={{ padding: '10px', borderBottom: '1px solid #334155' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.length === 0 ? (
                                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No snapshots available.</td></tr>
                                ) : (
                                    snapshots.map(s => (
                                        <tr key={s.SnapshotID} style={{ borderBottom: '1px solid #334155' }}>
                                            <td style={{ padding: '10px', color: '#f1f5f9' }}>{new Date(s.SnapshotAt).toLocaleString()}</td>
                                            <td style={{ padding: '10px', color: '#cbd5e1' }}>{s.EventWatermark}</td>
                                            <td style={{ padding: '10px', color: '#94a3b8' }}>{Math.round(s.SizeBytes / 1024)} KB</td>
                                            <td style={{ padding: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{s.FileHash.slice(0, 8)}</td>
                                            <td style={{ padding: '10px', display: 'flex', gap: '8px' }}>
                                                <button className="btn-secondary" onClick={() => {
                                                    setSeekTimestamp(s.SnapshotAt);
                                                    handleSeek(s.SnapshotAt);
                                                }} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Seek to This</button>
                                                <button className="btn-primary" onClick={() => handleBranch(s.SnapshotAt)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Branch Here</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="glass-card" style={{ padding: '20px' }}>
                        <h2 style={{ fontSize: '1.1rem', margin: '0 0 16px 0', color: '#f1f5f9' }}>Seek Validation</h2>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Target Timestamp</label>
                                <input type="datetime-local" value={seekTimestamp} onChange={e => setSeekTimestamp(e.target.value)} className="form-input" style={{ background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }} />
                            </div>
                            <button className="btn-secondary" onClick={() => handleSeek(seekTimestamp)} style={{ height: '35px' }}>Check Seekability</button>
                        </div>
                        {seekResult && (
                            <div style={{ background: seekResult.canSeek ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${seekResult.canSeek ? '#10b981' : '#ef4444'}`, padding: '16px', borderRadius: '8px' }}>
                                {seekResult.canSeek ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 600, marginBottom: '8px' }}>
                                            <CheckCircle2 size={18} /> Seekable Target
                                        </div>
                                        <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '16px' }}>
                                            Nearest anchor: {new Date(seekResult.snapshot.SnapshotAt).toLocaleString()} | Events to replay: {seekResult.eventsToReplay}
                                        </div>
                                        <button className="btn-primary" onClick={() => handleBranch(seekResult.targetTimestamp)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <GitBranch size={16} /> Branch From Here
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600 }}>
                                        <AlertTriangle size={18} /> {seekResult.reason}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'branches' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {branches.length === 0 ? (
                        <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            <GitBranch size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                            <div>No active branches. Create one from the Timeline or Snapshots tab.</div>
                        </div>
                    ) : (
                        branches.map(b => (
                            <div key={b.branchId} className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #8b5cf6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px 0', color: '#f1f5f9', fontSize: '1.1rem' }}>Branch from {new Date(b.timestamp).toLocaleString()}</h3>
                                        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                            Snapshot anchor: {new Date(b.snapshotAt).toLocaleString()} &nbsp;|&nbsp; Events replayed: <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{b.eventsReplayed}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn-secondary" onClick={() => handleViewDiff(b.branchId)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>View Diff</button>
                                        <button className="btn-primary" onClick={() => setSimulateForms({ ...simulateForms, [b.branchId]: simulateForms[b.branchId] ? null : { table: 'Asset', operation: 'UPDATE', payload: '' } })} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>Simulate</button>
                                        <button className="btn-secondary" onClick={() => handleDeleteBranch(b.branchId)} style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.8rem', padding: '6px 12px' }}><Trash2 size={14} /></button>
                                    </div>
                                </div>

                                {branchDiffs[b.branchId] && (
                                    <div style={{ background: 'rgba(15,23,42,0.5)', padding: '16px', borderRadius: '8px', border: '1px solid #334155', marginTop: '16px' }}>
                                        <div style={{ color: '#cbd5e1', fontWeight: 600, marginBottom: '12px', fontSize: '0.9rem' }}>{branchDiffs[b.branchId].length} events diverged since branch point</div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                                                    <th style={{ padding: '8px' }}>Timestamp</th>
                                                    <th style={{ padding: '8px' }}>Table</th>
                                                    <th style={{ padding: '8px' }}>Event</th>
                                                    <th style={{ padding: '8px' }}>Agg ID</th>
                                                    <th style={{ padding: '8px' }}>Payload</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {branchDiffs[b.branchId].length === 0 && <tr><td colSpan="5" style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>No divergent events yet.</td></tr>}
                                                {branchDiffs[b.branchId].map(ev => {
                                                    const badge = getEventBadge(ev.EventType);
                                                    return (
                                                        <tr key={ev.EventID} style={{ borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
                                                            <td style={{ padding: '8px', color: '#cbd5e1' }}>{new Date(ev.Timestamp).toLocaleTimeString()}</td>
                                                            <td style={{ padding: '8px', color: '#94a3b8' }}>{ev.TableName}</td>
                                                            <td style={{ padding: '8px' }}>
                                                                <span style={{ background: badge.bg, color: badge.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{ev.EventType}</span>
                                                            </td>
                                                            <td style={{ padding: '8px', color: '#94a3b8' }}>{ev.AggregateID}</td>
                                                            <td style={{ padding: '8px', color: '#64748b', fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {JSON.stringify(ev.PayloadAfter || ev.PayloadBefore)}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {simulateForms[b.branchId] && (
                                    <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', marginTop: '16px' }}>
                                        <h4 style={{ margin: '0 0 12px 0', color: '#f1f5f9', fontSize: '0.9rem' }}>Inject Hypothetical Event</h4>
                                        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Table</label>
                                                <select value={simulateForms[b.branchId].table} onChange={e => setSimulateForms({ ...simulateForms, [b.branchId]: { ...simulateForms[b.branchId], table: e.target.value } })} className="form-input" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }}>
                                                    {['Asset','Work','WorkTask','Schedule','Part','PO','ProductLoss','MeterReadings'].map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>Operation</label>
                                                <select value={simulateForms[b.branchId].operation} onChange={e => setSimulateForms({ ...simulateForms, [b.branchId]: { ...simulateForms[b.branchId], operation: e.target.value } })} className="form-input" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '6px 12px', borderRadius: '6px' }}>
                                                    <option value="INSERT">INSERT</option>
                                                    <option value="UPDATE">UPDATE</option>
                                                    <option value="DELETE">DELETE</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>JSON Payload</label>
                                            <textarea rows="4" value={simulateForms[b.branchId].payload} onChange={e => setSimulateForms({ ...simulateForms, [b.branchId]: { ...simulateForms[b.branchId], payload: e.target.value } })} placeholder='{"ID": 123, "Status": "Complete"}' className="form-input" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem' }} />
                                        </div>
                                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn-primary" onClick={() => handleSimulate(b.branchId)} disabled={simulating} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {simulating ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} Run Simulation
                                            </button>
                                        </div>
                                        
                                        {simulateResults[b.branchId] && (
                                            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px' }}>
                                                <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.85rem', marginBottom: '8px' }}>Simulation Success</div>
                                                <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                                    {JSON.stringify(simulateResults[b.branchId], null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
