// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — PM Schedule Calendar
 * =====================================
 * Full-featured calendar for preventative maintenance scheduling.
 * Visualizes PM due dates, work order deadlines, and sticky reminders
 * in month, week, and day views with PM frequency projection.
 *
 * VIEWS: Month | Week | Day (toggle buttons in header)
 *
 * CALENDAR ITEMS:
 *   PM Schedules   — Color-coded by category (Mechanical, Electrical, Safety, etc.)
 *                    Overdue PMs shown with red border; due-soon with amber
 *   Work Orders    — Scheduled WOs plotted on their SchDate
 *   Reminders      — Sticky-note style personal reminders with completion tracking
 *
 * KEY INTERACTIONS:
 *   Click a PM     — Opens PM detail with last/next dates and frequency
 *   Click a WO     — Links to the WO detail in WorkOrdersView
 *   Click a day    — Opens reminder creation for that date
 *   Drag an item   — Reschedules the PM or WO (PATCH to API)
 *
 * DATE MATH: PM items are projected forward from LastComp + FreqComp days.
 *   Items within 7 days show as "Due Soon"; past due show as "Overdue".
 *
 * API CALLS:
 *   GET /api/pm-schedules   All PM schedules with LastComp and FreqComp
 *   GET /api/work-orders    Open and scheduled WOs for the calendar period
 *   GET/POST /api/gap/scheduled-reports  Reminder management
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Wrench, AlertTriangle, Clock, Shield, List, Plus, ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

/**
 * ScheduleCalendar — Maintenance Planning Calendar View
 * =====================================================
 * Monthly calendar showing PMs, scheduled WOs, and upcoming tasks
 * Color coded: Emergency(red), Corrective(amber), PM(green), General WO(indigo)
 * Double-click a day → Quick Action menu (Create WO, Execute PM, Perform SOP)
 */
export default function ScheduleCalendar({ onNavigateToWO }) {
    const { t } = useTranslation();
    const [events, setEvents] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [quickActionDate, setQuickActionDate] = useState(null); // double-click target
    const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, onConfirm, accent }
    const [dragOverDate, setDragOverDate] = useState(null); // drag-and-drop target highlight
    const [dragToast, setDragToast] = useState(null); // { message, type }
    const [containerHeight, setContainerHeight] = useState(600);
    const containerRef = useRef(null);

    // Dynamically measure available height
    const updateHeight = useCallback(() => {
        if (containerRef.current) {
            const top = containerRef.current.getBoundingClientRect().top;
            // Safeguard: if top is unreasonably small (layout hasn't settled), 
            // use a reasonable estimate
            const safeTop = top < 100 ? 170 : top;
            const available = window.innerHeight - safeTop - 10; // 10px bottom margin
            setContainerHeight(Math.max(400, available));
        }
    }, []);

    useEffect(() => {
        updateHeight();
        window.addEventListener('resize', updateHeight);
        
        // Staggered re-measurements to handle layout settling after page refresh
        const t1 = setTimeout(updateHeight, 100);
        const t2 = setTimeout(updateHeight, 300);
        const t3 = setTimeout(updateHeight, 800);

        // ResizeObserver for robust parent layout changes
        let observer;
        if (containerRef.current?.parentElement && window.ResizeObserver) {
            observer = new ResizeObserver(() => updateHeight());
            observer.observe(containerRef.current.parentElement);
        }

        return () => { 
            window.removeEventListener('resize', updateHeight); 
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            if (observer) observer.disconnect();
        };
    }, [updateHeight]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        fetchEvents();
        const handleRefresh = () => fetchEvents();
        window.addEventListener('pf-calendar-refresh', handleRefresh);
        return () => window.removeEventListener('pf-calendar-refresh', handleRefresh);
    }, []);

    const fetchEvents = async () => {
        setLoading(true);
        const headers = {
            'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
        };
        try {
            const [evtRes, remRes] = await Promise.all([
                fetch('/api/pm-schedules/calendar/events', { headers }),
                fetch('/api/calendar/reminders', { headers })
            ]);
            const evtData = await evtRes.json();
            setEvents(evtData.events || []);
            const remData = await remRes.json();
            setReminders(Array.isArray(remData) ? remData : []);
        } catch (err) {
            console.error('Failed to load calendar data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Calendar grid computation
    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPad = firstDay.getDay(); // 0=Sun
        const totalDays = lastDay.getDate();

        const days = [];
        // Previous month padding
        const prevMonthLast = new Date(year, month, 0).getDate();
        for (let i = startPad - 1; i >= 0; i--) {
            days.push({ day: prevMonthLast - i, inMonth: false, date: null });
        }
        // Current month
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({ day: d, inMonth: true, date: dateStr });
        }
        // Next month padding (fill to 42 = 6 rows)
        const remaining = 42 - days.length;
        for (let d = 1; d <= remaining; d++) {
            days.push({ day: d, inMonth: false, date: null });
        }
        return days;
    }, [year, month]);

    // Group events by date for quick lookup
    const eventsByDate = useMemo(() => {
        const map = {};
        events.forEach(e => {
            if (!map[e.date]) map[e.date] = [];
            map[e.date].push(e);
        });
        return map;
    }, [events]);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToday = () => { setCurrentDate(new Date()); setSelectedDay(todayStr); };

    // Summary stats for the month
    const monthEvents = events.filter(e => e.date && e.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
    const pmCount = monthEvents.filter(e => e.type === 'pm').length;
    const woCount = monthEvents.filter(e => e.type === 'wo').length;
    const emergencyCount = monthEvents.filter(e => e.type === 'emergency').length;
    const correctiveCount = monthEvents.filter(e => e.type === 'corrective').length;
    const completedCount = monthEvents.filter(e => e.status === 'Completed').length;

    const selectedDayEvents = selectedDay ? (eventsByDate[selectedDay] || []) : [];
    const selectedDayReminders = selectedDay ? reminders.filter(r => r.reminder_date === selectedDay && !r.completed) : [];

    // ── Drag-and-Drop Rescheduling ──────────────────────────────────────────
    const handleDragStart = (e, evt) => {
        if (evt.status === 'Completed' || evt.status === 'Cancelled') return;
        e.dataTransfer.setData('application/json', JSON.stringify(evt));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOverDay = (e, dateStr) => {
        if (!dateStr) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverDate(dateStr);
    };

    const handleDragLeaveDay = () => {
        setDragOverDate(null);
    };

    const handleDropOnDay = async (e, targetDate) => {
        e.preventDefault();
        setDragOverDate(null);
        try {
            const evt = JSON.parse(e.dataTransfer.getData('application/json'));
            const woId = evt.woNumber || evt.dbId;
            if (!woId) return;
            if (evt.date === targetDate) return; // same day, no-op

            const headers = {
                'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
                'Content-Type': 'application/json'
            };

            const res = await fetch(`/api/work-orders/${woId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ SchDate: targetDate })
            });

            if (res.ok) {
                const dayLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                setDragToast({ message: `✅ Rescheduled to ${dayLabel}`, type: 'success' });
                setTimeout(() => setDragToast(null), 3000);
                fetchEvents();
            } else {
                setDragToast({ message: '❌ Reschedule failed', type: 'error' });
                setTimeout(() => setDragToast(null), 3000);
            }
        } catch (err) {
            console.error('Drop reschedule failed:', err);
            setDragToast({ message: '❌ Reschedule failed', type: 'error' });
            setTimeout(() => setDragToast(null), 3000);
        }
    };

    // Group reminders by date for calendar dot display
    const remindersByDate = useMemo(() => {
        const map = {};
        reminders.filter(r => !r.completed).forEach(r => {
            if (!map[r.reminder_date]) map[r.reminder_date] = [];
            map[r.reminder_date].push(r);
        });
        return map;
    }, [reminders]);

    const unscheduleEvent = async (evt) => {
        const deleteId = evt.woNumber || evt.dbId;
        if (!deleteId) return;
        setConfirmDialog({
            title: 'Unschedule Task',
            message: `Remove "${evt.title}" from the calendar?\nThe work order will be preserved, just unscheduled.`,
            accent: '#f59e0b',
            confirmLabel: 'Unschedule',
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    await fetch(`/api/work-orders/${deleteId}`, {
                        method: 'PUT',
                        headers: {
                            'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ SchDate: null, CompDate: null })
                    });
                    setTimeout(() => fetchEvents(), 300);
                } catch (err) {
                    console.error('Failed to unschedule event:', err);
                    setConfirmDialog({
                        title: 'Error',
                        message: 'Failed to remove from calendar. Please try again.',
                        accent: '#ef4444',
                        confirmLabel: 'OK',
                        onConfirm: () => setConfirmDialog(null),
                        hideCancel: true
                    });
                }
            }
        });
    };

    const dismissReminder = async (reminder) => {
        try {
            await fetch(`/api/calendar/reminders/${reminder.id}`, {
                method: 'PUT',
                headers: {
                    'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ completed: true })
            });
            setTimeout(() => fetchEvents(), 200);
        } catch (err) {
            console.error('Failed to dismiss reminder:', err);
        }
    };

    const getTypeIcon = (type) => {
        switch(type) {
            case 'emergency': return <AlertTriangle size={12} />;
            case 'corrective': return <Wrench size={12} />;
            case 'pm': return <Shield size={12} />;
            default: return <Clock size={12} />;
        }
    };

    const getTypeLabel = (type) => {
        switch(type) {
            case 'emergency': return t('schedule.calendar.emergency');
            case 'corrective': return t('schedule.calendar.corrective');
            case 'pm': return 'Preventive';
            default: return 'Work Order';
        }
    };

    if (loading) {
        return (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
                <Calendar className="animate-pulse" size={40} color="var(--primary)" />
                <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>{t('schedule.calendar.loadingMaintenanceCalendar')}</p>
            </div>
        );
    }

    return (
        <>
        <div ref={containerRef} className="cal-container" style={{ display: 'flex', gap: '20px', width: '100%', height: `${containerHeight}px`, maxHeight: `${containerHeight}px`, overflow: 'hidden' }}>
            {/* Main Calendar */}
            <div className="glass-card" style={{ flex: 3, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '8px 15px', borderBottom: '1px solid var(--glass-border)',
                    background: 'rgba(99, 102, 241, 0.03)', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button onClick={prevMonth} style={navBtn} title={t('schedule.goToPreviousMonthTip')}><ChevronLeft size={18} /></button>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', minWidth: '180px', textAlign: 'center' }}>
                            {monthNames[month]} {year}
                        </h3>
                        <button onClick={nextMonth} style={navBtn} title={t('schedule.goToNextMonthTip')}><ChevronRight size={18} /></button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button onClick={goToday} style={{ ...navBtn, padding: '6px 14px', fontSize: '0.8rem' }} title={t('schedule.jumpToTodaysDateTip')}>{t('schedule.calendar.today')}</button>
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={dot('#10b981')}></span>PM</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={dot('#6366f1')}></span>WO</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={dot('#f59e0b')}></span>{t('schedule.calendar.corrective')}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={dot('#ef4444')}></span>{t('schedule.calendar.emergency')}</span>
                        </div>
                    </div>
                </div>

                {/* Month Stats Bar */}
                <div style={{ display: 'flex', gap: '15px', padding: '6px 15px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.15)', fontSize: '0.7rem', flexShrink: 0 }}>
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>🔧 {pmCount} PMs</span>
                    <span style={{ color: '#6366f1', fontWeight: 'bold' }}>📋 {woCount} Work Orders</span>
                    <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠️ {correctiveCount} Corrective</span>
                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🚨 {emergencyCount} Emergency</span>
                    <span style={{ color: '#10b981' }}>✅ {completedCount} Completed</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{monthEvents.length} total events this month</span>
                </div>

                {/* Day Headers */}
                <div className="cal-day-headers" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                    {dayNames.map(d => (
                        <div key={d} style={{ 
                            padding: '4px', textAlign: 'center', fontSize: '0.7rem', 
                            fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase',
                            background: 'rgba(0,0,0,0.1)'
                        }}>{d}</div>
                    ))}
                </div>

                {/* Calendar Grid wrapper — position:absolute guarantees it fills but never exceeds available space */}
                <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                    <div className="cal-grid" style={{ 
                        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)',
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden'
                    }}>
                    {calendarDays.map((day, i) => {
                        const dayEvents = day.date ? (eventsByDate[day.date] || []) : [];
                        const dayReminders = day.date ? (remindersByDate[day.date] || []) : [];
                        const isToday = day.date === todayStr;
                        const isSelected = day.date === selectedDay;
                        const hasEmergency = dayEvents.some(e => e.type === 'emergency');

                        const isDragTarget = dragOverDate === day.date;

                        return (
                            <div
                                key={`item-${i}`}
                                onClick={() => day.inMonth && setSelectedDay(day.date)}
                                onDoubleClick={() => day.inMonth && setQuickActionDate(day.date)}
                                onDragOver={(e) => day.inMonth && handleDragOverDay(e, day.date)}
                                onDragLeave={handleDragLeaveDay}
                                onDrop={(e) => day.inMonth && handleDropOnDay(e, day.date)}
                                style={{
                                    padding: '4px',
                                    minHeight: '0',
                                    borderRight: '1px solid rgba(255,255,255,0.03)',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    background: isDragTarget ? 'rgba(16, 185, 129, 0.25)' : isSelected ? 'rgba(99, 102, 241, 0.1)' : isToday ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                                    opacity: day.inMonth ? 1 : 0.3,
                                    cursor: day.inMonth ? 'pointer' : 'default',
                                    transition: 'background 0.15s',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    outline: isDragTarget ? '2px solid #10b981' : 'none',
                                    outlineOffset: '-2px',
                                    borderRadius: isDragTarget ? '4px' : '0',
                                }}
                            >
                                <div style={{ 
                                    fontSize: '0.8rem', fontWeight: isToday ? 'bold' : 'normal',
                                    color: isToday ? '#10b981' : '#fff',
                                    marginBottom: '4px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <span style={isToday ? { background: '#10b981', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' } : {}}>
                                        {day.day}
                                    </span>
                                    {dayEvents.length > 0 && (
                                        <span style={{ fontSize: '0.6rem', color: hasEmergency ? '#ef4444' : 'var(--text-muted)' }}>
                                            {dayEvents.length}
                                        </span>
                                    )}
                                </div>

                                {/* Compact: just count badge + type dots */}
                                {dayEvents.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 'bold',
                                            padding: '1px 6px', borderRadius: '8px',
                                            background: hasEmergency ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.15)',
                                            color: hasEmergency ? '#ef4444' : 'var(--text-muted)'
                                        }}>
                                            {dayEvents.length} {dayEvents.length === 1 ? 'task' : 'tasks'}
                                        </span>
                                        {/* Type indicator dots */}
                                        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                            {dayEvents.some(e => e.type === 'pm') && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }}></span>}
                                            {dayEvents.some(e => e.type === 'wo') && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#6366f1' }}></span>}
                                            {dayEvents.some(e => e.type === 'corrective') && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b' }}></span>}
                                            {hasEmergency && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444' }}></span>}
                                            {dayReminders.length > 0 && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fbbf24' }}></span>}
                                        </div>
                                    </div>
                                )}
                                {/* Reminder-only indicator (no tasks on this day) */}
                                {dayEvents.length === 0 && dayReminders.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 'bold',
                                            padding: '1px 6px', borderRadius: '8px',
                                            background: 'rgba(251, 191, 36, 0.2)',
                                            color: '#fbbf24'
                                        }}>
                                            📌 {dayReminders.length}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                </div>
            </div>

            {/* Right Sidebar: Selected Day Detail */}
            <div className="glass-card cal-sidebar" style={{ width: '380px', minWidth: '380px', padding: '0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(99, 102, 241, 0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <List size={16} color="var(--primary)" />
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                {selectedDay 
                                    ? new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                                    : 'Select a Day'
                                }
                            </h4>
                        </div>
                        {selectedDay && (
                            <button 
                                onClick={() => setQuickActionDate(selectedDay)}
                                style={{
                                    background: '#10b981', border: 'none', color: '#fff', borderRadius: '6px',
                                    padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold'
                                }}
                                title={t('schedule.createANewTaskOrTip')}
                            >
                                <Plus size={14} /> {t('schedule.calendar.newTask')}
                            </button>
                        )}
                    </div>
                    {selectedDay && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {selectedDayEvents.length} task{selectedDayEvents.length !== 1 ? 's' : ''} scheduled
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {!selectedDay ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <Calendar size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                            <p style={{ fontSize: '0.85rem' }}>{t('schedule.calendar.clickADayTo')}</p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.5 }}>{t('schedule.calendar.doubleclickToAddTasks')}</p>
                        </div>
                    ) : selectedDayEvents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                            <p style={{ fontSize: '0.85rem' }}>{t('schedule.calendar.noTasksScheduledFor')}</p>
                        </div>
                    ) : (
                        selectedDayEvents.map((evt, i) => {
                            const canDelete = (evt.woNumber || evt.dbId) && evt.status !== 'Completed';
                            const canDrag = (evt.woNumber || evt.dbId) && evt.status !== 'Completed' && evt.status !== 'Cancelled';
                            return (
                            <div 
                                key={`item-${i}`}
                                draggable={canDrag}
                                onDragStart={(e) => canDrag && handleDragStart(e, evt)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    marginBottom: '8px',
                                    background: 'rgba(0,0,0,0.2)',
                                    borderLeft: `3px solid ${evt.color}`,
                                    transition: 'all 0.2s',
                                    cursor: canDrag ? 'grab' : 'default',
                                }}
                                className="nav-item-hover"
                                title={canDrag ? 'Drag to another day to reschedule' : ''}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ color: evt.color, display: 'flex', alignItems: 'center' }}>
                                            {getTypeIcon(evt.type)}
                                        </span>
                                        <span style={{ 
                                            fontSize: '0.65rem', padding: '1px 6px', borderRadius: '8px',
                                            background: evt.color + '20', color: evt.color, fontWeight: 'bold',
                                            textTransform: 'uppercase'
                                        }}>
                                            {getTypeLabel(evt.type)}
                                        </span>
                                    </div>
                                    {canDelete && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); unscheduleEvent(evt); }}
                                            title={t('schedule.calendar.removeFromCalendarKeeps')}
                                            style={{
                                                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                color: '#f87171', borderRadius: '6px', padding: '2px 8px',
                                                fontSize: '0.65rem', cursor: 'pointer', fontWeight: 'bold',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            ✕ Unschedule
                                        </button>
                                    )}
                                </div>
                                <div onClick={() => onNavigateToWO && evt.woNumber && onNavigateToWO(evt.woNumber)}
                                     style={{ cursor: evt.woNumber ? 'pointer' : 'default' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', marginBottom: '4px', lineHeight: '1.3' }}>
                                        {evt.title}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {evt.status && (
                                            <span style={{ 
                                                display: 'inline-block', padding: '1px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold',
                                                background: evt.status === 'Completed' ? 'rgba(16,185,129,0.15)' : evt.status === 'Cancelled' ? 'rgba(100,116,139,0.15)' : evt.status === 'In Progress' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)',
                                                color: evt.status === 'Completed' ? '#10b981' : evt.status === 'Cancelled' ? '#64748b' : evt.status === 'In Progress' ? '#6366f1' : '#f59e0b',
                                                width: 'fit-content'
                                            }}>
                                                {evt.status}
                                            </span>
                                        )}
                                        {evt.assetId && <span>Asset: {evt.assetId}</span>}
                                        {evt.assignedTo && <span>Assigned: {evt.assignedTo}</span>}
                                        {evt.freq && <span>Frequency: Every {evt.freq} {evt.freqUnit}</span>}
                                        {evt.woNumber && <span style={{ color: 'var(--primary)', fontSize: '0.7rem' }}>WO# {evt.woNumber}</span>}
                                    </div>
                                </div>
                            </div>
                            );
                        })
                    )}

                    {/* Yellow Sticky Note Reminders */}
                    {selectedDayReminders.length > 0 && (
                        <div style={{ marginTop: selectedDayEvents.length > 0 ? '12px' : '0' }}>
                            {selectedDayEvents.length > 0 && (
                                <div style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    📌 Reminders
                                </div>
                            )}
                            {selectedDayReminders.map(rem => (
                                <div
                                    key={`rem-${rem.id}`}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '4px',
                                        marginBottom: '6px',
                                        background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                        color: '#78350f',
                                        fontFamily: "'Segoe UI', sans-serif",
                                        fontSize: '0.85rem',
                                        fontWeight: '500',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)',
                                        transform: `rotate(${Math.random() > 0.5 ? '-0.5' : '0.5'}deg)`,
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ marginBottom: '6px', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{rem.note}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.65rem', color: '#92400e', opacity: 0.6 }}>
                                            {rem.created_by !== 'system' ? rem.created_by : ''}
                                        </span>
                                        <button 
                                            onClick={() => dismissReminder(rem)}
                                            title={t('schedule.markThisReminderAsDoneTip')}
                                            style={{
                                                background: 'rgba(120, 53, 15, 0.15)', border: 'none',
                                                color: '#78350f', borderRadius: '4px', padding: '2px 8px',
                                                fontSize: '0.65rem', cursor: 'pointer', fontWeight: 'bold'
                                            }}
                                        >
                                            ✓ Done
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>

            {/* Quick Actions Modal (double-click on day) */}
            {quickActionDate && (
                <CalendarQuickActions date={quickActionDate} onClose={() => setQuickActionDate(null)} onRefresh={fetchEvents} />
            )}

            {/* Custom Confirm Dialog (replaces native confirm/alert) */}
            {/* Drag-and-Drop Toast */}
            {dragToast && (
                <div style={{
                    position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 20000, padding: '12px 24px', borderRadius: 12,
                    background: dragToast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
                    color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    animation: 'slideInDown 0.3s ease-out',
                }}>
                    {dragToast.message}
                </div>
            )}

            {confirmDialog && (
                <ConfirmModal
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    accent={confirmDialog.accent || '#6366f1'}
                    confirmLabel={confirmDialog.confirmLabel || 'Confirm'}
                    hideCancel={confirmDialog.hideCancel}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </>
    );
}

/**
 * ConfirmModal — Styled confirmation dialog matching the app UI
 * Replaces native browser confirm() and alert() dialogs
 */
function ConfirmModal({ title, message, accent, confirmLabel, hideCancel, onConfirm, onCancel }) {
    const { t } = useTranslation();
    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 20000 }}>
            <div className="glass-card" onClick={e => e.stopPropagation()} style={{
                padding: '0', width: '380px', borderRadius: '16px', overflow: 'hidden',
                animation: 'fadeIn 0.15s ease-out'
            }}>
                {/* Accent bar */}
                <div style={{ height: '3px', background: accent }} />
                
                {/* Header */}
                <div style={{ padding: '20px 25px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <AlertTriangle size={18} color={accent} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>{title}</h3>
                    </div>
                </div>

                {/* Message */}
                <div style={{
                    padding: '0 25px 20px',
                    fontSize: '0.9rem', color: 'var(--text-muted)',
                    lineHeight: '1.5', whiteSpace: 'pre-line'
                }}>
                    {message}
                </div>

                {/* Actions */}
                <div style={{
                    padding: '12px 20px', borderTop: '1px solid var(--glass-border)',
                    display: 'flex', gap: '10px', justifyContent: 'flex-end'
                }}>
                    {!hideCancel && (
                        <button
                            onClick={onCancel}
                            title={t('schedule.cancelThisActionTip')}
                            style={{
                                padding: '9px 20px', borderRadius: '10px',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
                                color: '#fff', cursor: 'pointer', fontSize: '0.85rem'
                            }}
                        >
                            {t('schedule.calendar.cancel')}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        title={confirmLabel}
                        style={{
                            padding: '9px 24px', borderRadius: '10px',
                            background: accent, border: 'none',
                            color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
                            fontWeight: 'bold'
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

const navBtn = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--glass-border)',
    color: '#fff',
    borderRadius: '8px',
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s'
};

const dot = (color) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    display: 'inline-block'
});

/**
 * CalendarQuickActions — Modal shown on double-click of a calendar day
 * Allows creating WO, executing PM, or performing SOP for a specific date
 */
function CalendarQuickActions({ date, onClose, onRefresh }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('menu'); // 'menu' | 'select-pm' | 'select-sop' | 'add-reminder'
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [saving, setSaving] = useState(false);
    const [reminderText, setReminderText] = useState('');

    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const headers = {
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1',
        'Content-Type': 'application/json'
    };

    const fetchPMs = async (search = '') => {
        setLoadingItems(true);
        try {
            const res = await fetch(`/api/pm-schedules`, { headers });
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.data || []);
            setItems(search ? list.filter(p =>
                (p.Description || '').toLowerCase().includes(search.toLowerCase()) ||
                (p.ID || '').toString().toLowerCase().includes(search.toLowerCase())
            ) : list);
        } catch { setItems([]); }
        setLoadingItems(false);
    };

    const fetchSOPs = async (search = '') => {
        setLoadingItems(true);
        try {
            const res = await fetch(`/api/procedures?search=${encodeURIComponent(search)}&limit=100`, { headers });
            const data = await res.json();
            setItems(data.data || []);
        } catch { setItems([]); }
        setLoadingItems(false);
    };

    const handleSelectPM = () => { setStep('select-pm'); fetchPMs(); };
    const handleSelectSOP = () => { setStep('select-sop'); fetchSOPs(); };

    const handleCreateWO = () => {
        localStorage.setItem('PF_CAL_WO_DATE', date);
        localStorage.setItem('PF_JOBS_NESTED_TAB', 'work-orders');
        window.dispatchEvent(new CustomEvent('pf-calendar-action', { detail: { action: 'create-wo', date } }));
        onClose();
    };

    const handleSearch = (val) => {
        setSearchTerm(val);
        if (step === 'select-pm') fetchPMs(val);
        if (step === 'select-sop') fetchSOPs(val);
    };

    const handleScheduleItem = async () => {
        if (!selectedItem) return;
        setSaving(true);
        try {
            // Create a WO linked to the selected PM or SOP for the target date
            const desc = step === 'select-pm'
                ? `[PM-AUTO] ${selectedItem.Description || selectedItem.ID}`
                : `[SOP] ${selectedItem.Description || selectedItem.ID}`;
            
            await fetch('/api/work-orders', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    Description: desc,
                    SchDate: date,
                    AddDate: new Date().toISOString(),
                    StatusID: 40, // Plan
                    ProcID: step === 'select-sop' ? selectedItem.ID : undefined,
                    SchID: step === 'select-pm' ? selectedItem.ID : undefined,
                    TypeID: step === 'select-pm' ? 'PM' : 'SOP',
                    Priority: selectedItem.Priority || 100
                })
            });
            onClose();
            // Refresh calendar events after a short delay to ensure DB write completes
            setTimeout(() => { if (onRefresh) onRefresh(); }, 500);
        } catch (e) {
            console.error('Failed to schedule:', e);
        }
        setSaving(false);
    };

    const handleSaveReminder = async () => {
        if (!reminderText.trim()) return;
        setSaving(true);
        try {
            await fetch('/api/calendar/reminders', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    reminder_date: date,
                    note: reminderText.trim(),
                    created_by: localStorage.getItem('authUser') || 'system'
                })
            });
            onClose();
            setTimeout(() => { if (onRefresh) onRefresh(); }, 300);
        } catch (e) {
            console.error('Failed to save reminder:', e);
        }
        setSaving(false);
    };

    const actionBtnStyle = (bgColor) => ({
        display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 20px',
        background: bgColor + '13', border: `1px solid ${bgColor}50`,
        borderRadius: '12px', color: '#fff', cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.2s', width: '100%'
    });

    // ──── MAIN MENU ────
    if (step === 'menu') {
        return (
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 15000 }}>
                <div className="glass-card" onClick={e => e.stopPropagation()} style={{ padding: '0', width: '400px', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 25px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(99, 102, 241, 0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Calendar size={20} color="var(--primary)" />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('schedule.calendar.quickActions')}</h3>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dateLabel}</div>
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button onClick={handleCreateWO} style={actionBtnStyle('#6366f1')} title={t('schedule.createANewWorkOrderTip')}>
                            <div style={{ background: 'rgba(99, 102, 241, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                <ClipboardList size={22} color="#6366f1" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{t('schedule.calendar.createWorkOrder')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('schedule.calendar.scheduleANewMaintenance')}</div>
                            </div>
                        </button>
                        <button onClick={handleSelectPM} style={actionBtnStyle('#10b981')} title={t('schedule.selectAPreventiveMaintenanceScheduleTip')}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                <Shield size={22} color="#10b981" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{t('schedule.calendar.executePm')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('schedule.calendar.selectAPmSchedule')}</div>
                            </div>
                        </button>
                        <button onClick={handleSelectSOP} style={actionBtnStyle('#f59e0b')} title={t('schedule.selectAStandardOperatingProcedureTip')}>
                            <div style={{ background: 'rgba(245, 158, 11, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                <FileText size={22} color="#f59e0b" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{t('schedule.calendar.performSop')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('schedule.calendar.selectAProcedureTo')}</div>
                            </div>
                        </button>
                        <button onClick={() => setStep('add-reminder')} style={actionBtnStyle('#fbbf24')} title={t('schedule.addAPersonalReminderStickyTip')}>
                            <div style={{ background: 'rgba(251, 191, 36, 0.2)', borderRadius: '10px', padding: '10px', display: 'flex' }}>
                                <Clock size={22} color="#fbbf24" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{t('schedule.calendar.addReminder')}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('schedule.calendar.leaveAStickyNote')}</div>
                            </div>
                        </button>
                    </div>
                    <div style={{ padding: '10px 15px', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
                        <button onClick={onClose} className="btn-nav" title={t('schedule.closeTheQuickActionsMenuTip')} style={{ width: '100%' }}>{t('schedule.calendar.cancel')}</button>
                    </div>
                </div>
            </div>
        );
    }

    // ──── ADD REMINDER ────
    if (step === 'add-reminder') {
        return (
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 15000 }}>
                <div className="glass-card" onClick={e => e.stopPropagation()} style={{ padding: '0', width: '400px', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(251, 191, 36, 0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button onClick={() => setStep('menu')} 
                                title={t('schedule.returnToTheQuickActionsTip')}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                <ChevronLeft size={20} />
                            </button>
                            <Clock size={20} color="#fbbf24" />
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('schedule.calendar.addReminder')}</h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>for {dateLabel}</div>
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '20px' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                            borderRadius: '4px', padding: '16px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)',
                            transform: 'rotate(-0.5deg)'
                        }}>
                            <textarea
                                placeholder={t('schedule.calendar.orderPartsForPump')}
                                value={reminderText}
                                onChange={e => setReminderText(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%', minHeight: '100px', border: 'none', background: 'transparent',
                                    color: '#78350f', fontSize: '0.9rem', fontFamily: "'Segoe UI', sans-serif",
                                    resize: 'vertical', outline: 'none', lineHeight: '1.5'
                                }}
                                title={t('schedule.typeYourReminderNoteForTip')}
                            />
                        </div>
                    </div>
                    <div style={{ padding: '12px 15px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px' }}>
                        <button onClick={() => setStep('menu')}
                            title={t('schedule.returnToTheQuickActionsTip')}
                            style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', cursor: 'pointer' }}>
                            {t('schedule.calendar.back')}
                        </button>
                        <button
                            onClick={handleSaveReminder}
                            disabled={!reminderText.trim() || saving}
                            style={{
                                flex: 2, padding: '10px', borderRadius: '10px',
                                background: reminderText.trim() ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'rgba(255,255,255,0.05)',
                                border: 'none', color: reminderText.trim() ? '#78350f' : 'var(--text-muted)',
                                cursor: reminderText.trim() ? 'pointer' : 'not-allowed',
                                fontWeight: 'bold', fontSize: '0.9rem',
                                opacity: saving ? 0.6 : 1
                            }}
                            title={t('schedule.saveThisReminderToTheTip')}
                        >
                            {saving ? 'Saving...' : '📌 Pin Reminder'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ──── SELECT PM or SOP ────
    const isPM = step === 'select-pm';
    const accentColor = isPM ? '#10b981' : '#f59e0b';
    const title = isPM ? 'Select PM Schedule' : 'Select Procedure (SOP)';

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 15000 }}>
            <div className="glass-card" onClick={e => e.stopPropagation()} style={{ padding: '0', width: '480px', maxHeight: '80vh', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: `${accentColor}10`, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => { setStep('menu'); setSelectedItem(null); setSearchTerm(''); }} 
                            title={t('schedule.returnToTheQuickActionsTip')}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                            <ChevronLeft size={20} />
                        </button>
                        {isPM ? <Shield size={20} color={accentColor} /> : <FileText size={20} color={accentColor} />}
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>for {dateLabel}</div>
                        </div>
                    </div>
                    {/* Search */}
                    <input
                        type="text"
                        placeholder={`Search ${isPM ? 'PM schedules' : 'procedures'}...`}
                        value={searchTerm}
                        onChange={e => handleSearch(e.target.value)}
                        style={{
                            width: '100%', marginTop: '10px', padding: '8px 12px',
                            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)',
                            borderRadius: '8px', color: '#fff', fontSize: '0.85rem'
                        }}
                        autoFocus
                        title={`Search ${isPM ? 'PM schedules' : 'procedures'} by name or ID`}
                    />
                </div>

                {/* Scrollable List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px', minHeight: '200px', maxHeight: '400px' }}>
                    {loadingItems ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('schedule.calendar.loading')}</div>
                    ) : items.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No {isPM ? 'PM schedules' : 'procedures'} found
                        </div>
                    ) : (
                        items.map((item, idx) => {
                            const isSelected = selectedItem?.ID === item.ID;
                            return (
                                <div
                                    key={item.ID || idx}
                                    onClick={() => setSelectedItem(item)}
                                    style={{
                                        padding: '10px 14px', marginBottom: '6px',
                                        borderRadius: '10px', cursor: 'pointer',
                                        border: isSelected ? `2px solid ${accentColor}` : '1px solid var(--glass-border)',
                                        background: isSelected ? `${accentColor}15` : 'rgba(255,255,255,0.02)',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: isSelected ? accentColor : '#fff', marginBottom: '2px' }}>
                                        {item.Description || item.ID}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        <span>ID: {item.ID}</span>
                                        {item.AstID && <span>Asset: {item.AstID}</span>}
                                        {item.Freq && <span>Freq: {item.Freq} {item.FreqUnit}</span>}
                                        {item.plantLabel && <span>📍 {item.plantLabel}</span>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 15px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '10px', flexShrink: 0 }}>
                    <button onClick={() => { setStep('menu'); setSelectedItem(null); setSearchTerm(''); }}
                        title={t('schedule.returnToTheQuickActionsTip')}
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', cursor: 'pointer' }}>
                        {t('schedule.calendar.back')}
                    </button>
                    <button
                        onClick={handleScheduleItem}
                        disabled={!selectedItem || saving}
                        style={{
                            flex: 2, padding: '10px', borderRadius: '10px',
                            background: selectedItem ? `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)` : 'rgba(255,255,255,0.05)',
                            border: 'none', color: selectedItem ? '#fff' : 'var(--text-muted)',
                            cursor: selectedItem ? 'pointer' : 'not-allowed',
                            fontWeight: 'bold', fontSize: '0.9rem',
                            opacity: saving ? 0.6 : 1
                        }}
                        title={selectedItem ? `Schedule this ${isPM ? 'PM' : 'procedure'} for ${dateLabel}` : `Choose a ${isPM ? 'PM schedule' : 'procedure'} first`}
                    >
                        {saving ? 'Scheduling...' : selectedItem
                            ? `Schedule ${isPM ? 'PM' : 'SOP'} →`
                            : `Select a ${isPM ? 'PM' : 'procedure'}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
