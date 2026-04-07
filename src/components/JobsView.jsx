// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Active Jobs Board
 * ================================
 * Multi-tab work management hub combining the WO list, PM calendar,
 * workforce analytics, and technician workload in one workspace.
 * The primary daily-use view for maintenance supervisors.
 *
 * TABS:
 *   Work Orders         — WorkOrdersView: full WO list with create, edit, and close-out
 *   Schedule Calendar   — ScheduleCalendar: PM schedule calendar and upcoming due dates
 *   Workforce Analytics — WorkforceAnalytics: expected vs. actual hours, tech benchmarks
 *   Tech Workload       — TechWorkload: open WO count and capacity per technician
 *
 * This container is optimized for large monitors in maintenance control rooms
 * but is fully responsive for mobile technicians via the PWA.
 */
import React, { useState } from 'react';
import WorkOrdersView from './WorkOrdersView';
import ScheduleCalendar from './ScheduleCalendar';
import { formatDate } from '../utils/formatDate';
import WorkforceAnalytics from './WorkforceAnalytics';
import TechWorkload from './TechWorkload';
import { Briefcase, CalendarClock, BookOpen, Clock, Printer, X, Eye, Plus, Trash2, Download, Calendar, BarChart3, Users } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import { useTranslation } from '../i18n/index.jsx';
import { statusClass } from '../utils/formatDate';
import LoadingSpinner from './LoadingSpinner';

import { TakeTourButton } from './ContextualTour';

export default function JobsView({ plantId }) {
    const { t } = useTranslation();
    const [nestedTab, setNestedTab] = useState(() => localStorage.getItem('PF_JOBS_NESTED_TAB') || 'work-orders');
    const [searchTerm, setSearchTerm] = useState('');

    // Analytics access control — only management roles or explicit flag
    const hasAnalyticsAccess = (() => {
        const role = localStorage.getItem('userRole');
        const flag = localStorage.getItem('canViewAnalytics') === 'true';
        const isCreator = localStorage.getItem('PF_USER_IS_CREATOR') === 'true';
        const analyticsRoles = ['general_manager', 'plant_manager', 'maintenance_manager', 'it_admin', 'creator'];
        return analyticsRoles.includes(role) || flag || isCreator;
    })();

    // Listen for calendar quick-action events
    React.useEffect(() => {
        const handler = (e) => {
            const { action, date } = e.detail || {};
            if (action === 'create-wo') {
                // Switch to WO tab with date pre-filled
                setNestedTab('work-orders');
                localStorage.setItem('PF_JOBS_NESTED_TAB', 'work-orders');
            } else if (action === 'execute-pm') {
                setNestedTab('pm-schedules');
            } else if (action === 'perform-sop') {
                // Navigate to Procedures tab
                window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'procedures' }));
            }
        };
        window.addEventListener('pf-calendar-action', handler);
        return () => window.removeEventListener('pf-calendar-action', handler);
    }, []);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding: '15px 25px', display: 'flex', gap: '20px', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Briefcase size={24} /> {t('jobs.jobsDashboard')}
                </h2>
                <div style={{ width: '2px', height: '30px', background: 'var(--glass-border)' }}></div>

                <div className="nav-pills no-print">
                    <button 
                        onClick={() => { setNestedTab('work-orders'); localStorage.setItem('PF_JOBS_NESTED_TAB', 'work-orders'); }}
                        className={`btn-nav ${nestedTab === 'work-orders' ? 'active' : ''}`}
                        title={t('jobs.viewAndManageActiveWorkTip')}
                    >
                        {t('jobs.activeWorkOrders')}
                    </button>
                    <button 
                        onClick={() => { setNestedTab('pm-schedules'); localStorage.setItem('PF_JOBS_NESTED_TAB', 'pm-schedules'); }}
                        className={`btn-nav ${nestedTab === 'pm-schedules' ? 'active' : ''}`}
                        title={t('jobs.viewAndConfigureRecurringPreventiveTip')}
                    >
                        {t('jobs.pmSchedules')}
                    </button>
                    <button 
                        onClick={() => { setNestedTab('calendar'); localStorage.setItem('PF_JOBS_NESTED_TAB', 'calendar'); }}
                        className={`btn-nav ${nestedTab === 'calendar' ? 'active' : ''}`}
                        title={t('jobs.visualCalendarViewOfScheduledTip')}
                    >
                        <Calendar size={16} style={{ marginRight: '4px', verticalAlign: 'text-bottom' }} />
                        {t('jobs.calendar')}
                    </button>
                    {hasAnalyticsAccess && (
                    <button 
                        onClick={() => { setNestedTab('workforce-analytics'); localStorage.setItem('PF_JOBS_NESTED_TAB', 'workforce-analytics'); }}
                        className={`btn-nav ${nestedTab === 'workforce-analytics' ? 'active' : ''}`}
                        title={t('jobs.workforcePerformanceAnalyticsTechnicianEfficiencyTip')}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <BarChart3 size={16} />
                        {t('jobs.workforceAnalytics', 'Workforce Analytics')}
                    </button>
                    )}
                    <button 
                        onClick={() => { setNestedTab('tech-workload'); localStorage.setItem('PF_JOBS_NESTED_TAB', 'tech-workload'); }}
                        className={`btn-nav ${nestedTab === 'tech-workload' ? 'active' : ''}`}
                        title={t('jobs.technicianWorkloadCapacitySeeHowTip')}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <Users size={16} />
                        {t('jobs.techWorkload', 'Tech Workload')}
                    </button>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('jobs.searchBoard')} width={250} title={t('jobs.filterWorkOrdersPmSchedulesTip')} />
                    <TakeTourButton tourId="jobs" nestedTab={nestedTab} />
                    <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'about' }))}
                        className="btn-primary" 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            background: 'rgba(99, 102, 241, 0.1)', 
                            color: 'var(--primary)',
                            border: '1px solid currentColor',
                            padding: '8px 16px',
                            fontSize: '0.85rem'
                        }}
                        title={t('jobs.openTheFullTrierOsTip')}
                    >
                        <BookOpen size={18} /> {t('jobs.manual')}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex' }}>
                {nestedTab === 'work-orders' && <WorkOrdersView plantId={plantId} searchTerm={searchTerm} />}
                {nestedTab === 'pm-schedules' && <PMListView plantId={plantId} searchTerm={searchTerm} />}
                {nestedTab === 'calendar' && <ScheduleCalendar />}
                {nestedTab === 'workforce-analytics' && <WorkforceAnalytics plantId={plantId} />}
                {nestedTab === 'tech-workload' && <div style={{ flex: 1, padding: '10px 0' }}><TechWorkload /></div>}
            </div>
        </div>
    );
}

function PMListView({ plantId, searchTerm }) {
    const { t } = useTranslation();
    const [schedules, setSchedules] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [viewingPM, setViewingPM] = React.useState(null);
    const [pmDetails, setPmDetails] = React.useState(null);
    const [loadingDetails, setLoadingDetails] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [editData, setEditData] = React.useState({});

    const filteredSchedules = React.useMemo(() => {
        if (!searchTerm) return schedules;
        const low = searchTerm.toLowerCase();
        return schedules.filter(s => 
            (s.ID?.toString().toLowerCase().includes(low)) ||
            (s.Description?.toLowerCase().includes(low)) ||
            (s.AstID?.toLowerCase().includes(low)) ||
            (s.plantLabel?.toLowerCase().includes(low))
        );
    }, [schedules, searchTerm]);

    const fetchSchedules = React.useCallback(() => {
        setLoading(true);
        fetch('/api/pm-schedules', { headers: { 'x-plant-id': plantId } })
            .then(res => res.json())
            .then(data => { setSchedules(data.data || data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [plantId]);

    React.useEffect(() => {
        fetchSchedules();
    }, [fetchSchedules]);

    const handleView = async (id) => {
        setLoadingDetails(true);
        setViewingPM(id);
        setPmDetails(null);
        setIsEditing(false);
        setIsCreating(false);
        try {
            const res = await fetch(`/api/pm-schedules/${id}`, { headers: { 'x-plant-id': plantId } });
            const data = await res.json();
            setPmDetails(data);
            setEditData(data);
        } catch (err) {
            console.error('Failed to load PM details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleNew = () => {
        setViewingPM('NEW');
        setPmDetails({ ID: '', Description: '', Freq: 30, FreqUnit: 'Days' });
        setEditData({ ID: '', Description: '', Freq: 30, FreqUnit: 'Days', Active: 1 });
        setIsEditing(true);
        setIsCreating(true);
    };

    const handleSave = async () => {
        try {
            const url = isCreating ? '/api/pm-schedules' : `/api/pm-schedules/${viewingPM}`;
            const method = isCreating ? 'POST' : 'PUT';
            
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify(editData)
            });
            if (res.ok) {
                setPmDetails(editData);
                setIsEditing(false);
                setIsCreating(false);
                if (isCreating) setViewingPM(null);
                fetchSchedules();
            } else {
                window.trierToast?.error('Failed to save schedule changes');
            }
        } catch (err) {
            console.error('Error saving PM schedule:', err);
        }
    };

    const handleDelete = async () => {
        if (!await confirm("Are you sure you want to delete this schedule? This action cannot be undone.")) return;
        try {
            const res = await fetch(`/api/pm-schedules/${viewingPM}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });
            if (res.ok) {
                setViewingPM(null);
                fetchSchedules();
            } else {
                window.trierToast?.error('Failed to delete schedule');
            }
        } catch (err) {
            console.error('Error deleting PM schedule:', err);
        }
    };

    if (loading) return <LoadingSpinner />;


    return (
        <>
            <div className={`glass-card`} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }} className="no-print">
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CalendarClock size={24} color="var(--primary)" /> {t('jobs.activePmSchedules')}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-primary" onClick={() => window.triggerTrierPrint('catalog-internal', { type: 'pm-schedules', items: filteredSchedules })} title={t('jobs.printTheFullListOfTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Printer size={16} /> {t('jobs.printFullList')}
                        </button>
                        <button className="btn-save" onClick={handleNew} title={t('jobs.createANewPreventiveMaintenanceTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={16} /> {t('jobs.newPm')}
                        </button>
                    </div>
                </div>


                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('common.id', 'ID')}</th>
                                <th>{t('common.description', 'Description')}</th>
                                <th>{t('jobs.interval')}</th>
                                <th>{t('jobs.nextRun')}</th>
                                <th>{t('jobs.status')}</th>
                                <th className="no-print">{t('jobs.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.isArray(filteredSchedules) && Array.from(new Set(filteredSchedules.map(p => p.ID))).map(id => {
                                const p = filteredSchedules.find(s => s.ID === id);
                                if (!p) return null;
                                return (
                                    <tr key={`${p.plantId || 'local'}-${p.ID}`}>
                                        <td style={{ fontWeight: 600 }}>{p.ID}</td>
                                        <td>{p.Description}</td>
                                        <td>{p.Freq ? `${p.Freq} ${p.FreqUnit || 'Days'}` : (p.EveryCount && p.EveryCount !== 257 ? `${p.EveryCount} (Legacy)` : '--')}</td>
                                        <td>{p.NextDate ? p.NextDate.split('T')[0] : (p.LastSch ? t('jobs.dueSoon', 'Due Soon') : t('common.na', 'N/A'))}</td>
                                        <td>
                                            <span className={statusClass(p.Freq ? 'Active' : 'New')}>
                                                {p.Freq ? t('jobs.scheduled', 'Scheduled') : t('jobs.draftNew', 'Draft / New')}
                                            </span>
                                        </td>
                                        <td className="no-print">
                                            <button className="btn-view-standard" onClick={() => handleView(p.ID)} title={t('jobs.viewFullPmScheduleDetailsTip')}>
                                                <Eye size={18} /> {t('jobs.view')}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {viewingPM && (
                <div className="modal-overlay" onClick={() => { setViewingPM(null); setPmDetails(null); }}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                        <ActionBar
                            title={isCreating ? t('jobs.newPmSchedule', 'New PM Schedule') : (isEditing ? t('jobs.editingPmTitle', 'Editing PM: {{id}}').replace('{{id}}', viewingPM) : t('jobs.pmScheduleTitle', 'PM Schedule: {{id}}').replace('{{id}}', viewingPM))}
                            icon={<CalendarClock size={20} />}
                            isEditing={isEditing}
                            isCreating={isCreating}
                            onEdit={() => setIsEditing(true)}
                            onSave={handleSave}
                            onPrint={() => pmDetails && window.triggerTrierPrint('pm-task', pmDetails)}
                            onClose={() => { setViewingPM(null); setPmDetails(null); }}
                            onDelete={handleDelete}
                            onCancel={() => { if (isCreating) { setViewingPM(null); setPmDetails(null); } setIsEditing(false); }}
                            showDelete={true}
                        />

                        <div className="scroll-area" style={{ flex: 1, padding: '30px', overflowY: 'auto', minHeight: 0 }}>
                            {loadingDetails ? (
                                <div style={{ textAlign: 'center', padding: '50px' }}>
                                    <div className="spinning" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 10px' }}></div>
                                    <span>{t('jobs.retrievingDeepRecordHistory')}</span>
                                </div>
                            ) : pmDetails && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                        <div className="panel-box">
                                            <h3>{t('jobs.scheduleParameters')}</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '10pt' }}>
                                                {isCreating && (
                                                    <div>
                                                        <strong style={{ color: '#6366f1' }}>{t('jobs.scheduleCodeId')}</strong>
                                                        <input type="text" value={editData.ID || ''} onChange={e => setEditData({...editData, ID: e.target.value.toUpperCase()})} style={{width: '100%', marginTop: '5px', fontWeight: 'bold'}} placeholder={t('jobs.eg05boilerservice')} title={t('jobs.enterAUniquePmScheduleTip')} />
                                                    </div>
                                                )}
                                                <div>
                                                    <strong style={{ color: '#6366f1' }}>{t('jobs.description')}</strong> 
                                                    {isEditing ? (
                                                        <input type="text" value={editData.Description || ''} onChange={e => setEditData({...editData, Description: e.target.value})} style={{width: '100%', marginTop: '5px'}} title={t('jobs.describeWhatMaintenanceThisPmTip')} />
                                                    ) : pmDetails.Description}
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                    <strong>{t('jobs.freq')}</strong> 
                                                    {isEditing ? (
                                                        <>
                                                            <input 
                                                                type="number" 
                                                                value={editData.Freq || ''} 
                                                                onChange={e => setEditData({...editData, Freq: Number(e.target.value)})} 
                                                                style={{width: '70px'}} 
                                                                placeholder={t('jobs.interval')}
                                                                title={t('jobs.howOftenThisPmShouldTip')}
                                                            />
                                                            <select value={editData.FreqUnit || 'Days'} onChange={e => setEditData({...editData, FreqUnit: e.target.value})} title={t('jobs.unitOfTimeForPmTip')}>
                                                                <option value="Days">{t('jobs.days')}</option>
                                                                <option value="Weeks">{t('jobs.weeks')}</option>
                                                                <option value="Months">{t('jobs.months')}</option>
                                                                <option value="Years">{t('jobs.years')}</option>
                                                            </select>
                                                        </>
                                                    ) : (pmDetails.Freq ? `${pmDetails.Freq} ${pmDetails.FreqUnit}` : (pmDetails.EveryCount ? `${pmDetails.EveryCount} ${t('jobs.legacyUnits', '(Legacy Units)')}` : t('assets.text.notSet', 'Not set')))}
                                                </div>
                                                <div>
                                                    <strong>{t('jobs.nextWindow')}</strong> 
                                                    {isEditing ? (
                                                        <input type="date" value={editData.NextDate ? editData.NextDate.split('T')[0] : ''} onChange={e => setEditData({...editData, NextDate: e.target.value})} title="Set the next scheduled run date for this PM" />
                                                    ) : (formatDate(pmDetails.NextDate) || t('jobs.unscheduled', 'Unscheduled'))}
                                                </div>

                                                {/* Meter-Based Trigger Config (Feature 2) */}
                                                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '10px', marginTop: '5px' }}>
                                                    <strong style={{ color: '#6366f1', fontSize: '0.85rem' }}>{t('jobs.triggerMode')}</strong>
                                                    {isEditing ? (
                                                        <select 
                                                            value={editData.TriggerType || 'time'} 
                                                            onChange={e => setEditData({...editData, TriggerType: e.target.value})}
                                                            style={{ width: '100%', marginTop: '5px' }}
                                                            title={t('jobs.chooseWhetherThisPmTriggersTip')}
                                                        >
                                                            <option value="time">{t('jobs.timebasedOnly')}</option>
                                                            <option value="meter">{t('jobs.meterbasedOnly')}</option>
                                                            <option value="both">{t('jobs.bothWhicheverHitsFirst')}</option>
                                                        </select>
                                                    ) : (
                                                        <span style={{ marginLeft: '10px' }}>
                                                            {pmDetails.TriggerType === 'meter' ? '📏 Meter-Based' : 
                                                             pmDetails.TriggerType === 'both' ? '⏱️+📏 Time + Meter' : 
                                                             '⏱️ Time-Based'}
                                                        </span>
                                                    )}
                                                </div>
                                                {(isEditing ? (editData.TriggerType === 'meter' || editData.TriggerType === 'both') : (pmDetails?.TriggerType === 'meter' || pmDetails?.TriggerType === 'both')) && (
                                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <strong>{t('jobs.meterThreshold')}</strong>
                                                        {isEditing ? (
                                                            <input 
                                                                type="number" 
                                                                value={editData.MeterTrigger || ''} 
                                                                onChange={e => setEditData({...editData, MeterTrigger: Number(e.target.value)})}
                                                                style={{ width: '100px' }}
                                                                placeholder={t('jobs.eg500Placeholder')}
                                                                title={t('jobs.numberOfMeterUnitsBeforeTip')}
                                                            />
                                                        ) : (
                                                            <span>{pmDetails.MeterTrigger ? t('jobs.everyNUnits', 'Every {{n}} units').replace('{{n}}', pmDetails.MeterTrigger.toLocaleString()) : t('assets.text.notSet', 'Not set')}</span>
                                                        )}
                                                        {!isEditing && pmDetails.MeterLastTriggered != null && (
                                                            <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>
                                                                {t('jobs.lastTriggeredAt', 'Last triggered at:')} {parseFloat(pmDetails.MeterLastTriggered).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="panel-box">
                                            <h3>{t('jobs.assetConfiguration')}</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '10pt' }}>
                                                <div>
                                                    <strong>{t('jobs.primaryAsset')}</strong> 
                                                    {isEditing ? (
                                                        <input type="text" value={editData.AstID || ''} onChange={e => setEditData({...editData, AstID: e.target.value})} style={{width: '100%'}} title={t('jobs.primaryAssetIdThisPmTip')} />
                                                    ) : (pmDetails.AstID || '--')}
                                                </div>
                                                <div>
                                                    <strong>{t('jobs.deptCode')}</strong> 
                                                    {isEditing ? (
                                                        <input type="text" value={editData.DepartID || ''} onChange={e => setEditData({...editData, DepartID: e.target.value})} style={{width: '100%'}} title={t('jobs.departmentOrCostCenterCodeTip')} />
                                                    ) : (pmDetails.DepartID || '--')}
                                                </div>
                                                <div>
                                                    <strong>{t('jobs.assigned')}</strong> 
                                                    {isEditing ? (
                                                        <input type="text" value={editData.AssignedID || ''} onChange={e => setEditData({...editData, AssignedID: e.target.value})} style={{width: '100%'}} title={t('jobs.technicianOrGroupAssignedToTip')} />
                                                    ) : (pmDetails.AssignedID || t('jobs.unassigned', 'Unassigned'))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '20px', padding: '25px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                        <h3 style={{ marginBottom: '10px', fontSize: '11pt' }}>{t('jobs.maintenanceMandate')}</h3>
                                        {isEditing ? (
                                            <textarea 
                                                value={editData.LongDescription || ''} 
                                                onChange={e => setEditData({...editData, LongDescription: e.target.value})} 
                                                style={{width: '100%', minHeight: '180px', fontSize: '10pt', lineHeight: '1.6'}} 
                                                title={t('jobs.detailedMaintenanceInstructionsAndNotesTip')}
                                            />
                                        ) : (
                                            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '10pt' }}>
                                                {pmDetails.LongDescription || t('jobs.defaultPmDescription', 'This preventative maintenance schedule is programmed to automatically trigger a new work order based on the defined frequency.')}
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="modal-footer">
                            {isEditing ? (
                                <>
                                    <button className="btn-nav" title={t('jobs.cancelEditingAndDiscardChangesTip')} onClick={() => { if (isCreating) { setViewingPM(null); setPmDetails(null); } setIsEditing(false); }}>{t('jobs.cancel')}</button>
                                    <button className="btn-save" title={t('jobs.saveAllChangesToThisTip')} onClick={handleSave}>{t('jobs.saveChanges')}</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn-nav" title={t('jobs.closeDetailViewTip')} onClick={() => { setViewingPM(null); setPmDetails(null); }}>{t('jobs.close')}</button>
                                    <button className="btn-primary" title={t('jobs.editThisPmSchedulesParametersTip')} onClick={() => setIsEditing(true)}>{t('jobs.editSchedule')}</button>
                                    <button className="btn-danger" title={t('jobs.permanentlyDeleteThisPmScheduleTip')} onClick={handleDelete}>{t('jobs.delete')}</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function SOPListView({ plantId, searchTerm }) {
    const { t } = useTranslation();
    const [procs, setProcs] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [viewingSOP, setViewingSOP] = React.useState(null);
    const [sopDetails, setSopDetails] = React.useState(null);
    const [loadingDetails, setLoadingDetails] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [isCreating, setIsCreating] = React.useState(false);
    const [editData, setEditData] = React.useState({});

    const filteredProcs = React.useMemo(() => {
        const procsArray = Array.isArray(procs) ? procs : (procs?.data && Array.isArray(procs.data) ? procs.data : []);
        if (!searchTerm) return procsArray;
        const low = searchTerm.toLowerCase();
        return procsArray.filter(p => 
            (p.ID?.toLowerCase().includes(low)) ||
            (p.Description?.toLowerCase().includes(low)) ||
            (p.plantLabel?.toLowerCase().includes(low))
        );
    }, [procs, searchTerm]);

    const fetchProcedures = React.useCallback(() => {
        setLoading(true);
        fetch('/api/procedures', { headers: { 'x-plant-id': plantId } })
            .then(res => {
                if (!res.ok) throw new Error("API Failure");
                return res.json();
            })
            .then(data => { setProcs(data.data || data || []); setLoading(false); })
            .catch(() => { setProcs([]); setLoading(false); });
    }, [plantId]);

    React.useEffect(() => {
        fetchProcedures();
    }, [fetchProcedures]);

    const handleView = async (id, sourcePlant = null) => {
        setLoadingDetails(true);
        setViewingSOP({ id, sourcePlant });
        setSopDetails(null);
        setIsEditing(false);
        setIsCreating(false);
        try {
            const url = sourcePlant ? `/api/procedures/${encodeURIComponent(id)}?sourcePlant=${sourcePlant}` : `/api/procedures/${encodeURIComponent(id)}`;
            const res = await fetch(url, { headers: { 'x-plant-id': plantId } });
            const data = await res.json();
            setSopDetails(data);
            setEditData(data);
        } catch (err) {
            console.error('Failed to load SOP details');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleNew = () => {
        setViewingSOP('NEW');
        const blankSOP = { ID: '', Description: '', RevNum: 1, _tasks: [], _parts: [] };
        setSopDetails(blankSOP);
        setEditData(blankSOP);
        setIsEditing(true);
        setIsCreating(true);
    };

    const handleSave = async () => {
        try {
            const url = isCreating ? '/api/procedures' : `/api/procedures/${encodeURIComponent(viewingSOP)}`;
            const method = isCreating ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify(editData)
            });
            if (res.ok) {
                setSopDetails(editData);
                setIsEditing(false);
                setIsCreating(false);
                if (isCreating) setViewingSOP(null);
                fetchProcedures();
            } else {
                window.trierToast?.error('Failed to save SOP changes');
            }
        } catch (err) {
            console.error('Error saving SOP:', err);
        }
    };

    const handleDelete = async () => {
        if (!await confirm("Are you sure you want to delete this SOP? This will also remove all task associations.")) return;
        try {
            const res = await fetch(`/api/procedures/${encodeURIComponent(viewingSOP)}`, {
                method: 'DELETE',
                headers: { 'x-plant-id': plantId }
            });
            if (res.ok) {
                setViewingSOP(null);
                fetchProcedures();
            } else {
                window.trierToast?.error('Failed to delete SOP');
            }
        } catch (err) {
            console.error('Error deleting SOP:', err);
        }
    };

    if (loading) return <LoadingSpinner />;


    return (
        <>
            <div className={`glass-card`} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }} className="no-print">
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <BookOpen size={24} color="var(--primary)" /> {t('jobs.sopLibrary')}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-primary" onClick={() => window.triggerTrierPrint('catalog-internal', { type: 'sops', items: filteredProcs })} title={t('jobs.printTheFullSopLibraryTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Printer size={16} /> {t('jobs.printLibrary')}
                        </button>
                        <button className="btn-save" onClick={handleNew} title={t('jobs.createANewStandardOperatingTip')} style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={16} /> {t('jobs.newSop')}
                        </button>
                    </div>
                </div>


                <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('jobs.code')}</th>
                                <th>Description</th>
                                <th>{t('jobs.location')}</th>
                                <th>{t('jobs.rev')}</th>
                                <th>{t('jobs.status')}</th>
                                <th className="no-print">{t('jobs.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.isArray(filteredProcs) && filteredProcs.map((p, idx) => (
                                <tr key={`${p.plantId || 'local'}-${p.ID}`} onClick={() => handleView(p.ID, p.plantId)} style={{ cursor: 'pointer' }}>
                                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{p.ID}</td>
                                    <td>{p.Description}</td>
                                    <td style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{p.plantLabel || 'Local Plant'}</td>
                                    <td>{p.RevNum || 0}</td>
                                    <td><span className={statusClass('Active')}>{t('jobs.active')}</span></td>
                                    <td className="no-print">
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            {p.plantId && p.plantId !== localStorage.getItem('nativePlantId') && (
                                                <button                                                     className="btn-primary"
                                                    style={{
                                                        padding: '6px 12px',
                                                        fontSize: '0.75rem',
                                                        background: 'rgba(16, 185, 129, 0.1)',
                                                        color: '#10b981',
                                                        border: '1px solid #10b981'
                                                    }}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (await confirm(`Do you want to implement SOP ${p.ID} from ${p.plantLabel} to your local database?`)) {
                                                            try {
                                                                const res = await fetch('/api/procedures/clone', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                        sourcePlantId: p.plantId,
                                                                        procedureId: p.ID,
                                                                        targetPlantId: localStorage.getItem('nativePlantId') || 'Demo_Plant_1'
                                                                    })
                                                                });
                                                                if (res.ok) window.trierToast?.success(`SOP ${p.ID} cloned successfully!`);
                                                                else window.trierToast?.error('Failed to clone SOP');
                                                            } catch (err) {
                                                                window.trierToast?.error('Error during cloning');
                                                            }
                                                        }
                                                    }}
                                                    title={t('jobs.cloneThisSopFromAnotherTip')}
                                                >
                                                    <Download size={14} /> {t('jobs.implement')}
                                                </button>
                                            )}
                                            <button className="btn-view-standard" title={t('jobs.viewFullSopDocumentationTip')} onClick={(e) => { e.stopPropagation(); handleView(p.ID, p.plantId); }}>
                                                <Eye size={18} /> {t('jobs.view')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {viewingSOP && (
                <div className="modal-overlay" onClick={() => { setViewingSOP(null); setSopDetails(null); }}>
                    <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
                        <ActionBar
                            title={isCreating ? 'New SOP' : (isEditing ? `Editing SOP: ${viewingSOP?.id || viewingSOP}` : `SOP: ${viewingSOP?.id || viewingSOP}`)}
                            icon={<BookOpen size={20} />}
                            isEditing={isEditing}
                            isCreating={isCreating}
                            onEdit={() => setIsEditing(true)}
                            onSave={handleSave}
                            onPrint={() => sopDetails && window.triggerTrierPrint('sop', sopDetails)}
                            onClose={() => { setViewingSOP(null); setSopDetails(null); }}
                            onDelete={handleDelete}
                            onCancel={() => { if (isCreating) { setViewingSOP(null); setSopDetails(null); } setIsEditing(false); }}
                            showDelete={true}
                        />

                        <div className="scroll-area" style={{ flex: 1, padding: '30px', overflowY: 'auto', minHeight: 0 }}>
                            {loadingDetails ? (
                                <div style={{ textAlign: 'center', padding: '50px' }}>
                                    <div className="spinning" style={{ border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', width: '30px', height: '30px', margin: '0 auto 10px' }}></div>
                                    <span>{t('jobs.retrievingProcedureDocumentation')}</span>
                                </div>
                            ) : sopDetails && (
                                <>
                                    {isEditing && (
                                        <div className="panel-box" style={{ marginBottom: '20px' }}>
                                            <h3>{t('jobs.modifyMetadata')}</h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                {isCreating && (
                                                    <div style={{ gridColumn: 'span 2' }}>
                                                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{t('jobs.procedureCodeId')}</label>
                                                        <input type="text" value={editData.ID || ''} onChange={e => setEditData({...editData, ID: e.target.value.toUpperCase()})} style={{width: '100%', border: '1px solid var(--primary)'}} placeholder={t('jobs.eg05blowmoldsop')} title={t('jobs.enterAUniqueSopCodeTip')} />
                                                    </div>
                                                )}
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('jobs.procedureDescription')}</label>
                                                    <input type="text" value={editData.Description || ''} onChange={e => setEditData({...editData, Description: e.target.value})} style={{width: '100%'}} title={t('jobs.describeWhatThisSopCoversTip')} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('jobs.revisionNumber')}</label>
                                                    <input type="number" value={editData.RevNum || ''} onChange={e => setEditData({...editData, RevNum: e.target.value})} style={{width: '100%'}} title={t('jobs.currentRevisionNumberForThisTip')} />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="panel-box" style={{ marginBottom: '20px' }}>
                                        <h3>{t('jobs.sequentialStandardOperatingInstructions')}</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            {isEditing ? (
                                                <>
                                                    {(editData._tasks || []).map((task, i) => (
                                                        <div key={`item-${i}`} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px', position: 'relative' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                                <span style={{ fontWeight: 600, color: 'var(--primary)', whiteSpace: 'nowrap' }}>STEP {task.TskOrder}:</span>
                                                                <input 
                                                                    type="text" 
                                                                    value={task.Description || ''} 
                                                                    onChange={e => {
                                                                        const nt = [...editData._tasks];
                                                                        nt[i] = {...nt[i], Description: e.target.value};
                                                                        setEditData({...editData, _tasks: nt});
                                                                    }}
                                                                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', padding: '4px 8px', borderRadius: '4px' }}
                                                                    title={t('jobs.stepDescriptionTitleTip')}
                                                                />
                                                                <button 
                                                                    onClick={async () => {
                                                                        if (await confirm("Remove this procedural step?")) {
                                                                            const nt = [...editData._tasks];
                                                                            nt.splice(i, 1);
                                                                            const reordered = nt.map((task, idx) => ({ ...task, TskOrder: idx + 1 }));
                                                                            setEditData({ ...editData, _tasks: reordered });
                                                                        }
                                                                    }}
                                                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '5px' }}
                                                                    title={t('jobs.removeStep')}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                            <textarea 
                                                                value={task.Instructions || ''} 
                                                                onChange={e => {
                                                                    const nt = [...editData._tasks];
                                                                    nt[i] = {...nt[i], Instructions: e.target.value};
                                                                    setEditData({...editData, _tasks: nt});
                                                                }}
                                                                style={{ 
                                                                    width: '100%', 
                                                                    minHeight: '320px', 
                                                                    background: 'rgba(255,255,255,0.02)', 
                                                                    border: '1px solid var(--glass-border)', 
                                                                    color: 'white', 
                                                                    padding: '16px', 
                                                                    borderRadius: '8px', 
                                                                    fontSize: '1rem',
                                                                    lineHeight: '1.6',
                                                                    fontFamily: "'Roboto Mono', monospace"
                                                                }}
                                                                title={t('jobs.detailedStepbystepInstructionsForThisTip')}
                                                            />
                                                        </div>
                                                    ))}
                                                    <button 
                                                        onClick={() => {
                                                            const currentTasks = editData._tasks || [];
                                                            const nextOrder = currentTasks.length + 1;
                                                            const newStep = { TskOrder: nextOrder, Description: `New Step ${nextOrder}`, Instructions: '', ID: null };
                                                            setEditData({ ...editData, _tasks: [...currentTasks, newStep] });
                                                        }}
                                                        className="btn-primary"
                                                        title={t('jobs.addANewProceduralStepTip')}
                                                        style={{ alignSelf: 'flex-start', background: 'rgba(99, 102, 241, 0.1)', border: '1px dashed var(--primary)', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
                                                    >
                                                        <Plus size={16} /> {t('jobs.addProceduralStep')}
                                                    </button>
                                                </>
                                            ) : (
                                                sopDetails._tasks?.length > 0 ? sopDetails._tasks.map((task, i) => (
                                                    <div key={`item-${i}`} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>STEP {task.TskOrder}: {task.Description}</div>
                                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '5px' }}>{task.Instructions}</div>
                                                    </div>
                                                )) : <div style={{ color: 'var(--text-muted)' }}>{t('jobs.noStepsDefinedIn')}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="panel-box">
                                        <h3>{t('jobs.requiredPartsTooling')}</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {(isEditing ? editData._parts : sopDetails._parts)?.length > 0 ? (isEditing ? editData._parts : sopDetails._parts).map((p, i) => (
                                                <div key={`item-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                                                    <span>{p.ID}: {p.Description}</span>
                                                    <span style={{ fontWeight: 600 }}>Qty: {p.EstQty}</span>
                                                </div>
                                            )) : <div style={{ color: 'var(--text-muted)' }}>{t('jobs.noSpecificPartsLinked')}</div>}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="modal-footer">
                            {isEditing ? (
                                <>
                                    <button className="btn-nav" title={t('jobs.cancelEditingAndDiscardSopTip')} onClick={() => { if (isCreating) { setViewingSOP(null); setSopDetails(null); } setIsEditing(false); }}>{t('jobs.cancel')}</button>
                                    <button className="btn-save" title={t('jobs.saveAllSopChangesTip')} onClick={handleSave}>{t('jobs.saveAllChanges')}</button>
                                </>
                            ) : (
                                <>
                                    <button className="btn-nav" title={t('jobs.closeSopDetailViewTip')} onClick={() => { setViewingSOP(null); setSopDetails(null); }}>{t('jobs.close')}</button>
                                    <button className="btn-primary" title={t('jobs.editThisSopsStepsAndTip')} onClick={() => setIsEditing(true)}>{t('jobs.editProcedure')}</button>
                                    <button className="btn-danger" title={t('jobs.permanentlyDeleteThisSopTip')} onClick={handleDelete}>{t('jobs.delete')}</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function AssetHistoryView({ plantId, searchTerm }) {
    const { t } = useTranslation();
    if (searchTerm && searchTerm.trim().length > 0) {
        return <WorkOrdersView plantId={plantId} assetFilter={searchTerm} />;
    }

    return (
        <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: '500px' }}>
                <Clock size={48} color="var(--primary)" style={{ marginBottom: '15px', opacity: 0.5 }} />
                <h3>{t('jobs.assetLifecycleIntelligence')}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Enter an Asset ID in the search bar above to view its full maintenance history, 
                    or visit the Analytics Dashboard for enterprise-wide trends.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button                         className="btn-primary" 
                        onClick={() => window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'dashboard' }))}
                        title={t('jobs.navigateToTheEnterpriseAnalyticsTip')}
                    >
                        {t('jobs.goToAnalyticsDashboard')}
                    </button>
                    <button 
                        className="btn-nav"
                        title={t('jobs.viewTheGlobalHistoryAndTip')}
                        onClick={() => window.dispatchEvent(new CustomEvent('pf-nav', { detail: 'history' }))}
                    >
                        {t('jobs.viewGlobalAuditLog')}
                    </button>
                </div>
            </div>
        </div>
    );
}
