// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Shift Handoff: Digital Maintenance Logbook
 * =======================================================
 * Notepad++-style shared text editor for shift-to-shift knowledge transfer.
 * Maintenance crew types directly into a persistent logbook — auto-saved every
 * 2 seconds — ensuring the incoming shift knows exactly what happened.
 *
 * KEY FEATURES:
 *   - Dark-themed line-numbered text editor (familiar Notepad++ aesthetic)
 *   - Auto-save: content persisted every 2 seconds; no manual save required
 *   - Lock entry: completed shifts lock their section (read-only after lock)
 *   - Named entries: each shift entry tagged with author + timestamp header
 *   - Search: full-text search across all shift log entries
 *   - Print: formatted shift handoff report for paper binder backup
 *   - Portal rendering: renders as a fixed panel via ReactDOM.createPortal
 *   - Trash: supervisors can delete entries (with confirmation)
 *
 * DATA SOURCES:
 *   GET  /api/shift-handoff       — Load shift log entries (plant-scoped)
 *   POST /api/shift-handoff       — Save new or updated entry
 *   DELETE /api/shift-handoff/:id — Delete a shift entry
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { BookOpen, Save, Trash2, Lock, User, Calendar, Search, X, Printer } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import PushToTalkButton from './PushToTalkButton';

/**
 * ShiftHandoff — Notepad++ Style Digital Maintenance Logbook
 * ============================================================
 * A shared text editor (like Notepad++) where maintenance crew types directly.
 * 
 * Design:
 *  - Dark-themed text editor with line numbers on the left
 *  - Users type directly into the editor — auto-saves every 2 seconds
 *  - Previous entries from other users appear as read-only colored blocks
 *  - Current user's active text area at the bottom
 *  - Each entry block shows: username, timestamp, lock status
 *  - Editable same day by author only — locked after logout
 *  - Delete = admin/creator only
 *  - Profanity filter runs server-side
 */
const ShiftHandoff = ({ selectedPlant }) => {
    const { t } = useTranslation();
    const [entries, setEntries] = useState([]);
    const [activeText, setActiveText] = useState('');
    const [activeEntryId, setActiveEntryId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved'
    const [editingId, setEditingId] = useState(null);
    const [editText, setEditText] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [toastMsg, setToastMsg] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [shiftParam, setShiftParam] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const scrollRef = useRef(null);
    const textareaRef = useRef(null);
    const saveTimerRef = useRef(null);
    const pollRef = useRef(null);

    const currentUser = localStorage.getItem('currentUser') || 'Unknown';
    const userRole = localStorage.getItem('userRole') || 'technician';
    const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
    const isAdmin = userRole === 'it_admin' || userRole === 'creator';

    const getHeaders = useCallback(() => ({
        'Content-Type': 'application/json',
        'x-plant-id': selectedPlant || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        'x-user-role': userRole,
        'x-is-creator': isCreator ? 'true' : 'false'
    }), [selectedPlant, userRole, isCreator]);

    // ── Fetch entries ──
    const fetchEntries = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            let url = '/api/shift-log?limit=100';
            if (dateFrom) url += `&from_date=${dateFrom}`;
            if (dateTo) url += `&to_date=${dateTo}`;
            if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`;
            if (shiftParam) url += `&shift=${shiftParam}`;
            const res = await fetch(url, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setEntries(data);
            }
        } catch (err) {
            console.error('Failed to fetch shift log:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [getHeaders, dateFrom, dateTo, searchQuery, shiftParam]);

    useEffect(() => {
        fetchEntries();
        // Poll every 20 seconds for new entries from other users
        pollRef.current = setInterval(() => fetchEntries(true), 20000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchEntries]);

    // Auto-scroll to bottom when entries update
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    // ── Auto-save logic (debounced 2 seconds) ──
    const autoSave = useCallback(async (text) => {
        if (!text || !text.trim()) return;
        setSaveStatus('saving');
        try {
            if (activeEntryId) {
                // Update existing entry
                const res = await fetch(`/api/shift-log/${activeEntryId}`, {
                    method: 'PUT',
                    headers: getHeaders(),
                    body: JSON.stringify({ username: currentUser, message: text.trim() })
                });
                if (res.ok) {
                    const data = await res.json();
                    setEntries(prev => prev.map(e => e.id === activeEntryId ? { ...e, message: data.message, updated_at: new Date().toISOString() } : e));
                    setSaveStatus('saved');
                }
            } else {
                // Create new entry
                const res = await fetch('/api/shift-log', {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({ username: currentUser, message: text.trim() })
                });
                if (res.ok) {
                    const data = await res.json();
                    setActiveEntryId(data.id);
                    setEntries(prev => [...prev, data.entry]);
                    setSaveStatus('saved');
                }
            }
        } catch (err) {
            console.error('Auto-save failed:', err);
            setSaveStatus('');
        }
        // Clear "saved" indicator after 3 seconds
        setTimeout(() => setSaveStatus(''), 3000);
    }, [activeEntryId, currentUser, getHeaders]);

    const handleTextChange = (e) => {
        const text = e.target.value;
        setActiveText(text);

        // Debounced auto-save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (text.trim()) {
            saveTimerRef.current = setTimeout(() => autoSave(text), 2000);
        }
    };

    // ── "New entry" — finalize current block and start fresh ──
    const finalizeAndStartNew = () => {
        if (activeText.trim()) {
            // Force save current text immediately
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            autoSave(activeText);
        }
        setActiveText('');
        setActiveEntryId(null);
    };

    // ── Edit entry (same-day, same-user) ──
    const startEdit = (entry) => {
        setEditingId(entry.id);
        setEditText(entry.message);
    };

    const saveEdit = async (id) => {
        if (!editText.trim()) return;
        try {
            const res = await fetch(`/api/shift-log/${id}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ username: currentUser, message: editText.trim() })
            });
            if (res.ok) {
                const data = await res.json();
                setEntries(prev => prev.map(e => e.id === id ? { ...e, message: data.message, updated_at: new Date().toISOString() } : e));
                setEditingId(null);
                setEditText('');
            } else {
                const err = await res.json();
                showToast(err.error || 'Cannot edit this entry');
            }
        } catch (err) {
            console.error('Failed to update entry:', err);
        }
    };

    // ── Delete entry (admin only) ──
    const deleteEntry = async (id) => {
        try {
            const res = await fetch(`/api/shift-log/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (res.ok) {
                setEntries(prev => prev.filter(e => e.id !== id));
                if (activeEntryId === id) {
                    setActiveEntryId(null);
                    setActiveText('');
                }
                setConfirmDeleteId(null);
            } else {
                const err = await res.json();
                setConfirmDeleteId(null);
                showToast(err.error || 'Cannot delete this entry');
            }
        } catch (err) {
            console.error('Failed to delete entry:', err);
            setConfirmDeleteId(null);
        }
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 3500);
    };

    // ── Helpers ──
    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        if (isToday) return time;
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
    };

    const canEdit = (entry) => {
        if (isAdmin) return true;
        if (entry.username !== currentUser) return false;
        if (entry.locked) return false;
        const entryDate = new Date(entry.created_at).toDateString();
        return entryDate === new Date().toDateString();
    };

    // Print current filtered view
    const printLog = () => {
        const plantLabel = (selectedPlant || '').replace(/_/g, ' ');
        let subtitle = '';
        if (dateFrom || dateTo) subtitle += `Date Range: ${dateFrom || 'Start'} → ${dateTo || 'Now'}  `;
        if (searchQuery.trim()) subtitle += `Search: "${searchQuery.trim()}"`;
        if (!subtitle) subtitle = 'All Entries (Last 100)';

        const rows = entries.map(e => {
            const d = new Date(e.created_at);
            const time = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            return `<tr>
                <td style="padding:6px 10px;border-bottom:1px solid #ddd;white-space:nowrap;font-size:12px;color:#555">${time}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-weight:600;font-size:12px;white-space:nowrap">${e.username}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #ddd;font-size:12px;white-space:pre-wrap">${(e.message || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><title>Shift Log - ${plantLabel}</title>
            <style>@media print{body{margin:0.5in}}</style></head><body>
            <div style="text-align:center;margin-bottom:16px">
                <h2 style="margin:0;font-family:Arial,sans-serif">Shift Handoff Log — ${plantLabel}</h2>
                <p style="margin:4px 0 0;color:#666;font-family:Arial,sans-serif;font-size:13px">${subtitle}</p>
                <p style="margin:2px 0 0;color:#999;font-family:Arial,sans-serif;font-size:11px">Printed: ${new Date().toLocaleString()}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif">
                <thead><tr style="background:#f0f0f0">
                    <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #333;font-size:12px">Date/Time</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #333;font-size:12px">User</th>
                    <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #333;font-size:12px">Entry</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p style="text-align:center;margin-top:20px;color:#aaa;font-size:10px;font-family:Arial,sans-serif">
                Trier OS — ${entries.length} entries
            </p>
            <script>window.onload=()=>window.print()</script>
        </body></html>`;

        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
    };

    // Consistent user colors
    const getUserColor = (name) => {
        const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];
        let hash = 0;
        for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    // Count total lines across all entries + active text
    const countLines = (text) => (text || '').split('\n').length;
    let runningLineNumber = 1;

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', borderLeft: '4px solid #3b82f6', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header Bar */}
            <div style={{
                background: 'rgba(59, 130, 246, 0.05)', padding: '8px 14px',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen color="#3b82f6" size={18} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                        {selectedPlant === 'all_sites' ? 'Corporate Log' : 'Shift Handoff Log'}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        — {selectedPlant === 'all_sites' ? 'All Sites' : (selectedPlant || '').replace(/_/g, ' ')}
                    </span>
                    {/* Save indicator */}
                    {saveStatus === 'saving' && (
                        <span style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                            <Save size={12} /> saving...
                        </span>
                    )}
                    {saveStatus === 'saved' && (
                        <span style={{ fontSize: '0.65rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                            <Save size={12} /> ✓ saved
                        </span>
                    )}
                </div>

                {/* Date Range Picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                    <button 
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        style={{
                            background: (dateFrom || dateTo) ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${(dateFrom || dateTo) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                            color: (dateFrom || dateTo) ? '#3b82f6' : 'var(--text-muted)',
                            borderRadius: '4px', padding: '3px 8px',
                            fontSize: '0.65rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                        title={t('shiftHandoff.filterByDateRangeTip')}
                    >
                        <Calendar size={12} />
                        {dateFrom || dateTo ? `${dateFrom || '...'} → ${dateTo || '...'}` : 'Date Range'}
                    </button>
                    {(dateFrom || dateTo) && (
                        <button 
                            onClick={() => { setDateFrom(''); setDateTo(''); setShowDatePicker(false); }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', display: 'flex' }}
                            title={t('shiftHandoff.clearDateFilterTip')}
                        >
                            <X size={12} />
                        </button>
                    )}
                    {showDatePicker && ReactDOM.createPortal(
                        <div
                            onClick={() => setShowDatePicker(false)}
                            style={{
                                position: 'fixed', inset: 0,
                                background: 'rgba(0,0,0,0.5)',
                                backdropFilter: 'blur(4px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 100000
                            }}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: 'linear-gradient(145deg, #1e1e2f, #161625)',
                                    border: '1px solid rgba(59,130,246,0.3)',
                                    borderRadius: '16px', padding: '24px', minWidth: '300px',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(59,130,246,0.15)',
                                    display: 'flex', flexDirection: 'column', gap: '12px',
                                    animation: 'fadeIn 0.15s ease-out'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Calendar size={16} /> Filter by Date Range
                                    </div>
                                    <button onClick={() => setShowDatePicker(false)}
                                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888', transition: 'all 0.15s' }}
                                        title="Close"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From:</label>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                    title={t('shiftHandoff.startDateForFilteringLogTip')}
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '0.85rem', colorScheme: 'dark' }} />
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To:</label>
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                    title={t('shiftHandoff.endDateForFilteringLogTip')}
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '0.85rem', colorScheme: 'dark' }} />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <button onClick={() => { const today = new Date().toISOString().split('T')[0]; setDateFrom(today); setDateTo(today); }}
                                        title={t('shiftHandoff.showOnlyTodaysEntriesTip')}
                                        style={{ flex: 1, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6', borderRadius: '8px', padding: '6px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>Today</button>
                                    <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setDateFrom(d.toISOString().split('T')[0]); setDateTo(new Date().toISOString().split('T')[0]); }}
                                        title={t('shiftHandoff.showEntriesFromTheLastTip')}
                                        style={{ flex: 1, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6', borderRadius: '8px', padding: '6px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>Last 7 Days</button>
                                    <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setDateFrom(d.toISOString().split('T')[0]); setDateTo(new Date().toISOString().split('T')[0]); }}
                                        title={t('shiftHandoff.showEntriesFromTheLastTip')}
                                        style={{ flex: 1, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#3b82f6', borderRadius: '8px', padding: '6px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}>Last 30 Days</button>
                                </div>
                                <button onClick={() => setShowDatePicker(false)}
                                    title={t('shiftHandoff.applyTheSelectedDateRangeTip')}
                                    style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 16px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 700, marginTop: '8px', boxShadow: '0 4px 15px rgba(59,130,246,0.35)' }}>Apply</button>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>

                {/* Shift Selector */}
                <select 
                    value={shiftParam} 
                    onChange={e => setShiftParam(e.target.value)}
                    title={t("shiftHandoff.filterByShiftTip", "Filter by Shift")}
                    style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        color: shiftParam ? "#3b82f6" : "var(--text-muted)", borderRadius: "4px", padding: "3px 8px",
                        fontSize: "0.65rem", outline: "none", cursor: "pointer"
                    }}
                >
                    <option value="">All Shifts</option>
                    <option value="1">1st Shift (07:00 - 15:00)</option>
                    <option value="2">2nd Shift (15:00 - 23:00)</option>
                    <option value="3">3rd Shift (23:00 - 07:00)</option>
                </select>

                {/* Search Box */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px', padding: '2px 8px'
                    }}>
                        <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') fetchEntries(); }}
                            placeholder={t('shiftHandoff.searchLogPlaceholder')}
                            style={{
                                background: 'transparent', border: 'none', outline: 'none',
                                color: '#fff', fontSize: '0.7rem', width: '100px',
                                padding: '2px 0'
                            }}
                            title={t('shiftHandoff.searchLogEntriesByKeywordTip')}
                        />
                        {searchQuery && (
                            <button onClick={() => { setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0', display: 'flex' }} title={t('shiftHandoff.clearSearchQueryTip')}>
                                <X size={10} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Print Button */}
                <button
                    onClick={printLog}
                    style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)', borderRadius: '4px', padding: '3px 8px',
                        fontSize: '0.65rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}
                    title={t('shiftHandoff.printCurrentViewTip')}
                >
                    <Printer size={12} /> Print
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {activeText.trim() && (
                        <button
                            onClick={finalizeAndStartNew}
                            style={{
                                background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#3b82f6', borderRadius: '4px', padding: '3px 10px',
                                fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer'
                            }}
                            title={t('shiftHandoff.saveCurrentEntryAndStartTip')}
                        >
                            + New Entry
                        </button>
                    )}
                    <User size={13} style={{ color: getUserColor(currentUser) }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: getUserColor(currentUser) }}>
                        {currentUser}
                    </span>
                </div>
            </div>

            {/* Editor Area — Notepad++ style with line numbers */}
            <div ref={scrollRef} style={{
                flex: 1, overflowY: 'auto', minHeight: 0,
                fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                fontSize: '0.82rem', lineHeight: '1.6',
                background: '#0d1117'
            }}>
                {loading ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading logbook...
                    </div>
                ) : (
                    <>
                        {/* Existing entries — read-only blocks */}
                        {entries.filter(e => e.id !== activeEntryId).map((entry) => {
                            const lines = entry.message.split('\n');
                            const startLine = runningLineNumber;
                            runningLineNumber += lines.length;
                            const color = getUserColor(entry.username);
                            const isMe = entry.username === currentUser;
                            const editable = canEdit(entry);

                            return (
                                <div key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    {/* Entry header — username + timestamp */}
                                    <div style={{
                                        padding: '4px 14px 4px 60px',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <User size={12} style={{ color }} />
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>
                                                {entry.username}
                                            </span>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                {formatTime(entry.created_at)}
                                                {entry.updated_at && entry.updated_at !== entry.created_at && ' (edited)'}
                                            </span>
                                            {entry.locked ? <Lock size={10} style={{ color: '#555' }} title="Locked" /> : null}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {editable && editingId !== entry.id && (
                                                <button onClick={() => startEdit(entry)}
                                                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.6rem', padding: '2px 4px' }}
                                                    title="Edit"
                                                >✏️</button>
                                            )}
                                            {isAdmin && (
                                                <button onClick={() => setConfirmDeleteId(entry.id)}
                                                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.6rem', padding: '2px 4px' }}
                                                    title={t('shiftHandoff.deleteAdminTip')}
                                                >🗑️</button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Lines with line numbers */}
                                    {editingId === entry.id ? (
                                        <div style={{ padding: '4px 14px 4px 60px' }}>
                                            <textarea
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
                                                style={{
                                                    width: '100%', minHeight: '60px', background: 'rgba(59,130,246,0.05)',
                                                    border: '1px solid rgba(59,130,246,0.3)', borderRadius: '4px',
                                                    padding: '6px 8px', color: '#e0e0e0', fontFamily: 'inherit',
                                                    fontSize: 'inherit', lineHeight: 'inherit', resize: 'vertical', outline: 'none'
                                                }}
                                                autoFocus
                                                title={t('shiftHandoff.editThisLogEntryPressTip')}
                                            />
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                <button onClick={() => saveEdit(entry.id)}
                                                    title={t('shiftHandoff.saveChangesToThisEntryTip')}
                                                    style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '4px', padding: '3px 12px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    Save
                                                </button>
                                                <button onClick={() => setEditingId(null)}
                                                    title={t('shiftHandoff.cancelEditingThisEntryTip')}
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        lines.map((line, li) => (
                                            <div key={li} style={{ display: 'flex', minHeight: '1.6em' }}>
                                                {/* Line number gutter */}
                                                <div style={{
                                                    width: '48px', flexShrink: 0, textAlign: 'right',
                                                    padding: '0 8px 0 0', color: '#555',
                                                    fontSize: '0.72rem', userSelect: 'none',
                                                    borderRight: `2px solid ${color}40`,
                                                    background: 'rgba(0,0,0,0.15)'
                                                }}>
                                                    {startLine + li}
                                                </div>
                                                {/* Line content */}
                                                <div style={{
                                                    flex: 1, padding: '0 12px',
                                                    color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                                }}>
                                                    {line || '\u00A0'}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            );
                        })}

                        {/* Active text area — where current user types */}
                        <div style={{ borderTop: entries.length > 0 ? '2px solid rgba(59,130,246,0.2)' : 'none', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {/* The actual typing area with line numbers */}
                            <div style={{ display: 'flex', position: 'relative', flex: 1 }}>
                                {/* Line numbers for active text */}
                                <div style={{
                                    width: '48px', flexShrink: 0, textAlign: 'right',
                                    padding: '4px 8px 4px 0', color: '#555',
                                    fontSize: '0.72rem', userSelect: 'none',
                                    borderRight: `2px solid ${getUserColor(currentUser)}40`,
                                    background: 'rgba(0,0,0,0.15)',
                                    lineHeight: '1.6',
                                    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
                                }}>
                                    {(activeText || '').split('\n').map((_, i) => (
                                        <div key={i}>{runningLineNumber + i}</div>
                                    ))}
                                </div>

                                {/* Textarea */}
                                <textarea
                                    ref={textareaRef}
                                    value={activeText}
                                    onChange={handleTextChange}
                                    placeholder={t('shiftHandoff.startTypingYourShiftNotesPlaceholder')}
                                    style={{
                                        flex: 1, minHeight: '100%',
                                        background: 'transparent',
                                        border: 'none', outline: 'none',
                                        padding: '4px 12px',
                                        color: '#e0e0e0',
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        fontSize: '0.82rem', lineHeight: '1.6',
                                        resize: 'none',
                                        caretColor: '#3b82f6'
                                    }}
                                    title={t('shiftHandoff.typeYourShiftNotesHereTip')}
                                />
                                
                                <div style={{ display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px' }}>
                                    <PushToTalkButton 
                                        onResult={(text) => {
                                            const newText = (activeText ? activeText + '\n' : '') + `[${new Date().toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})}] ` + text;
                                            handleTextChange({ target: { value: newText } });
                                        }}
                                        placeholder="Hold to Dictate"
                                    />
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', width: '100%', maxWidth: '100px' }}>Hold to transcribe a voice entry</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Delete Confirmation Modal ── */}
            {confirmDeleteId && (
                <div
                    onClick={() => setConfirmDeleteId(null)}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 100000
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(145deg, #1e1e2f, #161625)',
                            border: '1px solid rgba(239,68,68,0.35)',
                            borderRadius: '16px',
                            padding: '28px 32px',
                            maxWidth: '400px',
                            width: '90%',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(239,68,68,0.1)',
                            animation: 'fadeIn 0.15s ease-out'
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            marginBottom: '12px'
                        }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                background: 'rgba(239,68,68,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Trash2 size={18} color="#f87171" />
                            </div>
                            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>
                                Delete Log Entry?
                            </span>
                        </div>
                        <p style={{
                            fontSize: '0.85rem', color: 'var(--text-muted)',
                            lineHeight: '1.6', margin: '0 0 22px 0'
                        }}>
                            This will permanently remove this entry from the shift log.
                            This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setConfirmDeleteId(null)}
                                style={{
                                    padding: '10px 22px', borderRadius: '10px',
                                    cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid var(--glass-border)',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                }}
                                title={t('shiftHandoff.cancelKeepThisEntryTip')}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => deleteEntry(confirmDeleteId)}
                                style={{
                                    padding: '10px 22px', borderRadius: '10px',
                                    cursor: 'pointer',
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    border: 'none',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                    boxShadow: '0 4px 15px rgba(239,68,68,0.3)',
                                    transition: 'all 0.15s ease'
                                }}
                                title={t('shiftHandoff.permanentlyDeleteThisLogEntryTip')}
                            >
                                🗑️ Delete Entry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast Notification ── */}
            {toastMsg && (
                <div style={{
                    position: 'fixed', bottom: '30px', left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(239,68,68,0.9)',
                    backdropFilter: 'blur(10px)',
                    color: '#fff', padding: '12px 24px',
                    borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                    zIndex: 100001,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    {toastMsg}
                </div>
            )}

        </div>
    );
};

export default ShiftHandoff;
