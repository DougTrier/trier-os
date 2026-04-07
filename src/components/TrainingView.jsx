// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Employee Training & Certification View
 * ====================================================
 * Training records dashboard for internal plant employees covering
 * course library management, completion tracking, certification expiry
 * alerts, and role-based assignment compliance.
 *
 * TABS:
 *   Training Records    — Per-employee completion history with pass/fail and expiry date
 *   Course Library      — Master list of courses (OSHA 10, Forklift, LOTO, Food Safety, etc.)
 *   Assignments         — Required training per role or department (compliance matrix)
 *   Compliance Score    — % of required training current per employee and per department
 *   Expiring Soon       — Certifications within 30/60/90 days of expiry requiring renewal
 *
 * CERT EXPIRY ALERTS: Employees within 30 days of expiry shown with amber badges.
 *   Expired certifications shown with red badges and appear in the notifications feed.
 *
 * API CALLS:
 *   GET /api/training/courses       Course library
 *   GET /api/training/records       Completion records (filter: ?employeeId, ?courseId)
 *   GET /api/training/assignments   Role-based required training assignments
 *   GET /api/training/compliance    Compliance % summary by department
 *   POST/PUT to each for CRUD operations
 *
 * @param {string} plantId - Current plant identifier
 */

import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, AlertTriangle, CheckCircle, Clock, Users, BookOpen, BarChart2, RefreshCw, Plus, X, ChevronDown, ChevronUp, Search } from 'lucide-react';

const authHeaders = (plant) => ({
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
    'x-plant-id': plant || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
    'Content-Type': 'application/json',
});

const API = (path, plant, opts = {}) =>
    fetch(path, { headers: authHeaders(plant), ...opts }).then(r => r.json());

// ── Status Badge ─────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const map = {
        current: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Current' },
        'expiring-soon': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring Soon' },
        expired: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
        'no-expiry': { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', label: 'No Expiry' },
        compliant: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Compliant' },
        'at-risk': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'At Risk' },
        'non-compliant': { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Non-Compliant' },
    };
    const s = map[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: status };
    return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.color}33`, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    );
}

// ── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = '#6366f1', warn = false }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${warn ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: warn ? '#ef4444' : color }}>
                {icon}
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: warn ? '#ef4444' : '#f1f5f9', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{sub}</div>}
        </div>
    );
}

// ── Log Training Modal ────────────────────────────────────────────────────
function LogTrainingModal({ courses, onClose, onSaved, plant }) {
    const [form, setForm] = useState({ user_id: '', user_name: '', department: '', course_id: '', completed_date: new Date().toISOString().split('T')[0], score: '', trainer: '', certificate_number: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

    const save = async () => {
        if (!form.user_name || !form.course_id || !form.completed_date) { setErr('Employee name, course, and completion date are required.'); return; }
        setSaving(true);
        setErr('');
        try {
            const res = await fetch('/api/training/records', {
                method: 'POST', headers: authHeaders(plant),
                body: JSON.stringify({ ...form, user_id: form.user_id || form.user_name.toLowerCase().replace(/\s+/g, '.'), plant_id: plant }),
            });
            const data = await res.json();
            if (!res.ok) { setErr(data.error || 'Failed to save'); return; }
            onSaved(data);
            onClose();
        } catch (e) { setErr(e.message); }
        finally { setSaving(false); }
    };

    const inp = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#f1f5f9', borderRadius: 8, padding: '9px 12px', fontSize: '0.85rem', width: '100%', outline: 'none', boxSizing: 'border-box' };
    const lbl = { fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-card" style={{ width: 540, maxHeight: '90vh', overflow: 'auto', padding: 30, position: 'relative' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={22} /></button>
                <h3 style={{ margin: '0 0 24px', fontSize: '1.15rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GraduationCap size={20} color="#10b981" /> Log Training Completion
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={lbl}>Employee Name *</label><input style={inp} value={form.user_name} onChange={set('user_name')} placeholder="Full Name" /></div>
                    <div><label style={lbl}>Employee ID / Username</label><input style={inp} value={form.user_id} onChange={set('user_id')} placeholder="username or ID" /></div>
                    <div><label style={lbl}>Department</label><input style={inp} value={form.department} onChange={set('department')} placeholder="Maintenance, Production…" /></div>
                    <div><label style={lbl}>Course *</label>
                        <select style={inp} value={form.course_id} onChange={set('course_id')}>
                            <option value="">— Select course —</option>
                            {Object.entries(
                                (courses || []).reduce((acc, c) => { (acc[c.category] = acc[c.category] || []).push(c); return acc; }, {})
                            ).map(([cat, list]) => (
                                <optgroup key={cat} label={cat}>
                                    {list.map(c => <option key={c.id} value={c.id}>{c.title} ({c.validity_days > 0 ? `${c.validity_days}d validity` : 'no expiry'})</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div><label style={lbl}>Completion Date *</label><input type="date" style={inp} value={form.completed_date} onChange={set('completed_date')} /></div>
                    <div><label style={lbl}>Score (%)</label><input type="number" style={inp} value={form.score} onChange={set('score')} placeholder="Optional" min="0" max="100" /></div>
                    <div><label style={lbl}>Trainer / Instructor</label><input style={inp} value={form.trainer} onChange={set('trainer')} placeholder="Name or agency" /></div>
                    <div><label style={lbl}>Certificate #</label><input style={inp} value={form.certificate_number} onChange={set('certificate_number')} placeholder="Optional" /></div>
                </div>
                <div style={{ marginTop: 14 }}><label style={lbl}>Notes</label><textarea style={{ ...inp, height: 70, resize: 'vertical' }} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" /></div>

                {err && <div style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={save} disabled={saving} style={{ flex: 2, padding: '10px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                        {saving ? 'Saving…' : '✓ Log Training'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function TrainingView({ plantId, plantLabel }) {
    const [tab, setTab] = useState('dashboard');
    const [data, setData] = useState({ dashboard: null, records: [], courses: [], compliance: null, expiring: null });
    const [loading, setLoading] = useState(false);
    const [showLogModal, setShowLogModal] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedEmployee, setExpandedEmployee] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [dash, records, courses, compliance, expiring] = await Promise.all([
                API(`/api/training/dashboard${plantId !== 'all_sites' ? `?plant_id=${plantId}` : ''}`, plantId),
                API(`/api/training/records?limit=200${plantId !== 'all_sites' ? `&plant_id=${plantId}` : ''}`, plantId),
                API('/api/training/courses', plantId),
                API(`/api/training/compliance${plantId !== 'all_sites' ? `?plant_id=${plantId}` : ''}`, plantId),
                API(`/api/training/expiring?days=60${plantId !== 'all_sites' ? `&plant_id=${plantId}` : ''}`, plantId),
            ]);
            setData({ dashboard: dash, records: Array.isArray(records) ? records : [], courses: Array.isArray(courses) ? courses : [], compliance, expiring });
        } catch (e) {
            setError('Failed to load training data');
        } finally {
            setLoading(false);
        }
    }, [plantId]);

    useEffect(() => { load(); }, [load]);

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={14} /> },
        { id: 'records', label: 'Records', icon: <BookOpen size={14} /> },
        { id: 'compliance', label: 'Compliance', icon: <CheckCircle size={14} /> },
        { id: 'expiring', label: 'Expiring', icon: <Clock size={14} /> },
        { id: 'courses', label: 'Course Library', icon: <GraduationCap size={14} /> },
    ];

    const filteredRecords = (data.records || []).filter(r =>
        !search || r.user_name?.toLowerCase().includes(search.toLowerCase()) || r.course_title?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredEmployees = (data.compliance?.employees || []).filter(e =>
        !search || e.user_name?.toLowerCase().includes(search.toLowerCase()) || e.department?.toLowerCase().includes(search.toLowerCase())
    );

    const rowStyle = { borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' };
    const thS = { padding: '9px 12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' };
    const tdS = { padding: '10px 12px', color: '#e2e8f0', fontSize: '0.83rem', verticalAlign: 'middle' };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)', overflow: 'hidden' }}>
            {/* Header */}
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: '#10b981', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GraduationCap size={24} /> Training & Certifications
                </h2>
                <div style={{ width: 2, height: 30, background: 'var(--glass-border)' }} />
                <div className="nav-pills" style={{ padding: 0, margin: 0, background: 'transparent' }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`btn-nav ${tab === t.id ? 'active' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.icon} {t.label}
                            {t.id === 'expiring' && (data.expiring?.count || 0) > 0 && (
                                <span style={{ background: '#f59e0b', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800 }}>{data.expiring.count}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                    <button onClick={load} disabled={loading} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    <button onClick={() => setShowLogModal(true)} style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700 }}>
                        <Plus size={16} /> Log Training
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 4px' }}>
                {error && <div style={{ color: '#ef4444', padding: 20 }}>{error}</div>}
                {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#64748b', gap: 12 }}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />Loading training data…</div>}

                {!loading && !error && (
                    <>
                        {/* ── DASHBOARD ── */}
                        {tab === 'dashboard' && data.dashboard && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                                    <StatCard icon={<Users size={16} />} label="Employees Tracked" value={data.dashboard.totalEmployees || 0} sub={`${data.dashboard.activeCourses || 0} active courses`} color="#818cf8" />
                                    <StatCard icon={<BookOpen size={16} />} label="Total Records" value={data.dashboard.totalRecords || 0} sub="All-time training completions" color="#6366f1" />
                                    <StatCard icon={<CheckCircle size={16} />} label="Compliance Rate" value={`${data.dashboard.complianceRate || 0}%`} sub={`${data.dashboard.totalEmployees - (data.dashboard.totalRecords > 0 ? 0 : 0)} employees in system`} color="#10b981" />
                                    <StatCard icon={<Clock size={16} />} label="Expiring (30 Days)" value={data.dashboard.expiringSoon || 0} sub="Need renewal action" color="#f59e0b" warn={(data.dashboard.expiringSoon || 0) > 0} />
                                    <StatCard icon={<AlertTriangle size={16} />} label="Already Expired" value={data.dashboard.expired || 0} sub="Immediate attention required" color="#ef4444" warn={(data.dashboard.expired || 0) > 0} />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    {/* By Category */}
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9' }}>Training by Category</h3>
                                        {(data.dashboard.byCategory || []).map((cat, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <span style={{ fontSize: '0.83rem', color: '#e2e8f0' }}>{cat.category}</span>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#818cf8' }}>{cat.records}</span>
                                            </div>
                                        ))}
                                        {(data.dashboard.byCategory || []).length === 0 && <p style={{ color: '#64748b', fontSize: '0.83rem' }}>No training records yet. Log the first one above.</p>}
                                    </div>

                                    {/* Upcoming Expiries */}
                                    <div className="glass-card" style={{ padding: 20 }}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Clock size={16} color="#f59e0b" /> Upcoming Expiries (60 Days)
                                        </h3>
                                        {(data.dashboard.upcomingExpiries || []).length === 0
                                            ? <p style={{ color: '#10b981', fontSize: '0.83rem' }}>✅ No expiries in the next 60 days</p>
                                            : (data.dashboard.upcomingExpiries || []).map((r, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.83rem', color: '#e2e8f0', fontWeight: 600 }}>{r.user_name}</div>
                                                        <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{r.course_title}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.82rem', color: r.days_left <= 14 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>{r.days_left}d left</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.expires_date}</div>
                                                    </div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── RECORDS ── */}
                        {tab === 'records' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee or course…" style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                                    </div>
                                    <span style={{ color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{filteredRecords.length} records</span>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                {['Employee', 'Course', 'Category', 'Completed', 'Expires', 'Status', 'Trainer', 'Cert #'].map(h => (
                                                    <th key={h} style={thS}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRecords.map((r, i) => (
                                                <tr key={i} style={rowStyle}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={tdS}>
                                                        <div style={{ fontWeight: 600 }}>{r.user_name}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.department}</div>
                                                    </td>
                                                    <td style={tdS}>
                                                        <div>{r.course_title}</div>
                                                        <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#818cf8' }}>{r.course_code}</div>
                                                    </td>
                                                    <td style={tdS}><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.category}</span></td>
                                                    <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{r.completed_date}</td>
                                                    <td style={{ ...tdS, whiteSpace: 'nowrap', color: r.expiry_status === 'expired' ? '#ef4444' : r.expiry_status === 'expiring-soon' ? '#f59e0b' : '#94a3b8' }}>
                                                        {r.expires_date || '—'}
                                                    </td>
                                                    <td style={tdS}><StatusBadge status={r.expiry_status} /></td>
                                                    <td style={{ ...tdS, color: '#64748b' }}>{r.trainer || '—'}</td>
                                                    <td style={{ ...tdS, fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>{r.certificate_number || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {filteredRecords.length === 0 && <p style={{ color: '#64748b', padding: '20px 0', textAlign: 'center' }}>No training records found. Click "Log Training" to add the first one.</p>}
                                </div>
                            </div>
                        )}

                        {/* ── COMPLIANCE ── */}
                        {tab === 'compliance' && data.compliance && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {[
                                        { label: 'Compliant', val: data.compliance.compliant, color: '#10b981' },
                                        { label: 'At Risk', val: data.compliance.atRisk, color: '#f59e0b' },
                                        { label: 'Non-Compliant', val: data.compliance.nonCompliant, color: '#ef4444' },
                                        { label: 'Total Employees', val: data.compliance.totalEmployees, color: '#818cf8' },
                                    ].map(s => (
                                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${s.color}33`, borderRadius: 10, padding: '12px 18px', minWidth: 120 }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>{s.label}</div>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.val}</div>
                                        </div>
                                    ))}
                                    <div style={{ marginLeft: 'auto', position: 'relative' }}>
                                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…" style={{ padding: '9px 12px 9px 34px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 220 }} />
                                    </div>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {['Employee', 'Dept', 'Total Certs', 'Current', 'Expiring', 'Expired', 'Status'].map(h => (
                                                <th key={h} style={thS}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEmployees.map((emp, i) => (
                                            <React.Fragment key={i}>
                                                <tr style={{ ...rowStyle, cursor: 'pointer' }}
                                                    onClick={() => setExpandedEmployee(expandedEmployee === i ? null : i)}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={tdS}><div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{expandedEmployee === i ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{emp.user_name}</div></td>
                                                    <td style={{ ...tdS, color: '#64748b' }}>{emp.department || '—'}</td>
                                                    <td style={{ ...tdS, textAlign: 'center' }}>{emp.totalCertifications}</td>
                                                    <td style={{ ...tdS, textAlign: 'center', color: '#10b981', fontWeight: 700 }}>{emp.current}</td>
                                                    <td style={{ ...tdS, textAlign: 'center', color: '#f59e0b', fontWeight: 700 }}>{emp.expiringSoon}</td>
                                                    <td style={{ ...tdS, textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{emp.expired}</td>
                                                    <td style={tdS}><StatusBadge status={emp.status} /></td>
                                                </tr>
                                                {expandedEmployee === i && (
                                                    <tr>
                                                        <td colSpan={7} style={{ padding: '0 12px 12px 36px', background: 'rgba(255,255,255,0.02)' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 10 }}>
                                                                {(emp.records || []).map((r, j) => (
                                                                    <div key={j} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem' }}>
                                                                        <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 3 }}>{r.course_title}</div>
                                                                        <div style={{ color: '#64748b' }}>Expires: {r.expires_date || 'No expiry'}</div>
                                                                        <StatusBadge status={r.status} />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredEmployees.length === 0 && <p style={{ color: '#64748b', padding: '20px', textAlign: 'center' }}>No employee records found. Log training completions to build the compliance picture.</p>}
                            </div>
                        )}

                        {/* ── EXPIRING ── */}
                        {tab === 'expiring' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Clock size={18} /> Expiring or Expired Certifications
                                </h3>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>{['Employee', 'Course', 'Category', 'Regulatory Ref', 'Expires', 'Days Until Expiry'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {(data.expiring?.records || []).map((r, i) => (
                                            <tr key={i} style={rowStyle}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={tdS}><div style={{ fontWeight: 600 }}>{r.user_name}</div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.department}</div></td>
                                                <td style={tdS}>{r.course_title}</td>
                                                <td style={{ ...tdS, color: '#64748b' }}>{r.category}</td>
                                                <td style={{ ...tdS, fontSize: '0.75rem', color: '#818cf8', fontFamily: 'monospace' }}>{r.regulatory_ref || '—'}</td>
                                                <td style={{ ...tdS, color: '#f59e0b', whiteSpace: 'nowrap' }}>{r.expires_date}</td>
                                                <td style={{ ...tdS, textAlign: 'center' }}>
                                                    <span style={{ fontWeight: 800, color: r.days_until_expiry <= 14 ? '#ef4444' : '#f59e0b', fontSize: '1.1rem' }}>{r.days_until_expiry}d</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {(data.expiring?.count || 0) === 0 && <p style={{ color: '#10b981', padding: '20px 0', textAlign: 'center' }}>✅ No certifications expiring in the next 60 days</p>}
                            </div>
                        )}

                        {/* ── COURSES ── */}
                        {tab === 'courses' && (
                            <div className="glass-card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search courses…" style={{ width: '100%', padding: '9px 12px 9px 34px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                                    </div>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>{['Code', 'Title', 'Category', 'Duration', 'Validity', 'Regulatory Ref', 'Recurring'].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {data.courses.filter(c => !search || c.title?.toLowerCase().includes(search.toLowerCase()) || c.code?.toLowerCase().includes(search.toLowerCase())).map((c, i) => (
                                            <tr key={i} style={rowStyle}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ ...tdS, fontFamily: 'monospace', color: '#818cf8', fontWeight: 700 }}>{c.code}</td>
                                                <td style={tdS}><div style={{ fontWeight: 600 }}>{c.title}</div>{c.description && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{c.description.slice(0, 60)}</div>}</td>
                                                <td style={tdS}><span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 20 }}>{c.category}</span></td>
                                                <td style={{ ...tdS, textAlign: 'center' }}>{c.duration_hours}h</td>
                                                <td style={{ ...tdS, textAlign: 'center' }}>{c.validity_days > 0 ? `${c.validity_days} days` : 'Permanent'}</td>
                                                <td style={{ ...tdS, fontSize: '0.75rem', color: '#818cf8', fontFamily: 'monospace' }}>{c.regulatory_ref || '—'}</td>
                                                <td style={{ ...tdS, textAlign: 'center' }}>{c.is_recurring ? <span style={{ color: '#10b981' }}>✓</span> : <span style={{ color: '#64748b' }}>—</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Log Modal */}
            {showLogModal && (
                <LogTrainingModal
                    courses={data.courses}
                    plant={plantId}
                    onClose={() => setShowLogModal(false)}
                    onSaved={() => { setShowLogModal(false); load(); }}
                />
            )}
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
