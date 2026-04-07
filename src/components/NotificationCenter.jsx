// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Notification Center
 * ================================
 * In-app notification panel surfacing system alerts, PM reminders,
 * part transfer approvals, sensor alarms, and @mention messages.
 * Renders as a portal-mounted dropdown from the header bell icon.
 *
 * NOTIFICATION TYPES:
 *   PM Due         — PM schedule due within the configured advance window
 *   WO Assigned    — Work order assigned to current user
 *   WO Overdue     — Work order past its due date and still open
 *   Transfer Req   — Part transfer request pending approval
 *   Sensor Alarm   — Sensor threshold exceeded (temperature, vibration, etc.)
 *   @Mention       — Chat message directed at current user
 *   Escalation     — Work order escalated past its priority threshold
 *
 * KEY FEATURES:
 *   - Bell icon badge: unread count shown as a red dot in the app header
 *   - Mark as read: click notification to navigate to source and mark read
 *   - Bulk dismiss: "Clear All" button marks all notifications as read
 *   - Click-through: each notification navigates to its source (WO, PM, sensor)
 *   - Auto-refresh: polls every 60 seconds for new notifications
 *   - Portal rendering: mounts outside the main DOM tree to prevent clipping
 *
 * API CALLS:
 *   GET  /api/notifications          — All unread notifications for current user
 *   POST /api/notifications/read     — Mark notification(s) as read
 *   POST /api/notifications/clear    — Clear all notifications
 */
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Bell, AlertTriangle, Package, Server, X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n/index.jsx';

const NotificationCenter = ({ plantId }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const navigate = useNavigate();

    const [dismissedIds, setDismissedIds] = useState(new Set());

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications', {
                headers: {
                    'x-plant-id': plantId,
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                setNotifications(data);
                const visible = data.filter(n => !dismissedIds.has(n.id || n.title));
                setUnreadCount(visible.length);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    };

    const dismissAll = () => {
        const allIds = new Set(notifications.map(n => n.id || n.title));
        setDismissedIds(allIds);
        setUnreadCount(0);
    };

    const dismissOne = (e, id) => {
        e.stopPropagation();
        const newDismissed = new Set(dismissedIds);
        newDismissed.add(id);
        setDismissedIds(newDismissed);
        setUnreadCount(Math.max(0, unreadCount - 1));
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [plantId, dismissedIds]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case 'EMERGENCY_WO': return <AlertTriangle size={18} color="#ef4444" />;
            case 'TRANSFER_REQ': return <Package size={18} color="#f59e0b" />;
            case 'SYSTEM_ALERT': return <Server size={18} color="#3b82f6" />;
            default: return <Bell size={18} />;
        }
    };

    const handleItemClick = (link) => {
        setIsOpen(false);
        if (link && link !== '#') {
            navigate(link);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <button 
                ref={buttonRef}
                onClick={() => {
                    setIsOpen(!isOpen);
                }}
                style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '50%',
                    width: '45px',
                    height: '45px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: unreadCount > 0 ? 'var(--primary)' : '#fff',
                    position: 'relative',
                    transition: 'all 0.3s ease'
                }}
                title={unreadCount > 0 
                    ? (() => {
                        const visible = notifications.filter(n => !dismissedIds.has(n.id || n.title));
                        const emergency = visible.filter(n => n.type === 'EMERGENCY_WO').length;
                        const transfer = visible.filter(n => n.type === 'TRANSFER_REQ').length;
                        const system = visible.filter(n => n.type === 'SYSTEM_ALERT').length;
                        
                        let lines = [`${unreadCount} Critical Items for ${plantId.replace('_', ' ')}:`];
                        if (emergency > 0) lines.push(`• ${emergency} Emergency Work Order${emergency > 1 ? 's' : ''}`);
                        if (transfer > 0) lines.push(`• ${transfer} Pending Part Transfer${transfer > 1 ? 's' : ''}`);
                        if (system > 0) lines.push(`• ${system} System Alert${system > 1 ? 's' : ''}`);
                        lines.push('\nAction required to clear.');
                        return lines.join('\n');
                    })()
                    : `System Alerts for ${plantId.replace('_', ' ')} (None)`
                }
            >
                <Bell size={22} className={unreadCount > 0 ? 'breath' : ''} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        border: '2px solid #1e1e2d'
                    }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && ReactDOM.createPortal(
                <div ref={dropdownRef} className="glass-card" style={{
                    position: 'fixed',
                    top: (() => {
                        const rect = buttonRef.current?.getBoundingClientRect();
                        return rect ? rect.bottom + 8 : 60;
                    })(),
                    left: (() => {
                        const rect = buttonRef.current?.getBoundingClientRect();
                        return rect ? Math.max(10, rect.left - 140) : 100;
                    })(),
                    width: '320px',
                    maxHeight: '450px',
                    zIndex: 999999,
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    border: '1px solid var(--primary)'
                }}>
                    <div style={{
                        padding: '12px 15px',
                        borderBottom: '1px solid var(--glass-border)',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary)' }}>{t('notification.center.plantAlerts')}</h4>
                            {unreadCount > 0 && <button onClick={dismissAll} title={t('notificationCenter.dismissAllNotificationsTip')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}>{t('notification.center.clearAll')}</button>}
                        </div>
                        <button onClick={() => setIsOpen(false)} title={t('notificationCenter.closeNotificationsPanelTip')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {notifications.filter(n => !dismissedIds.has(n.id || n.title)).length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <div style={{ marginBottom: '10px', opacity: 0.3 }}><Bell size={32} style={{ margin: 'auto' }} /></div>
                                {t('notification.center.noCriticalAlertsAt')}
                            </div>
                        ) : (
                            notifications.filter(n => !dismissedIds.has(n.id || n.title)).map((n, i) => (
                                <div 
                                    key={n.id || i} 
                                    onClick={() => handleItemClick(n.link)}
                                    style={{
                                        padding: '15px',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                        position: 'relative'
                                    }}
                                    className="hover-highlight notification-item"
                                >
                                    <button 
                                        onClick={(e) => dismissOne(e, n.id || n.title)}
                                        style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s' }}
                                        title={t('notificationCenter.dismissThisNotificationTip')}
                                        className="dismiss-btn"
                                    >
                                        <X size={14} />
                                    </button>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div style={{ marginTop: '3px' }}>{getIcon(n.type)}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px', color: n.severity === 'CRITICAL' ? '#fca5a5' : '#fff' }}>
                                                {n.title}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                                {n.message}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{new Date(n.date).toLocaleString()}</span>
                                                <ExternalLink size={10} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    <div style={{ padding: '10px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Live Monitoring: {plantId.replace('_', ' ')}
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                .hover-highlight:hover {
                    background: rgba(255,255,255,0.05);
                }
                .notification-item:hover .dismiss-btn {
                    opacity: 1 !important;
                }
                @keyframes breath {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); color: var(--primary); }
                }
                .breath {
                    animation: breath 2s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default NotificationCenter;
