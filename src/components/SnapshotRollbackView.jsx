// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Database Snapshot Rollback
 * =======================================
 * Admin interface for managing point-in-time database snapshots.
 * Lists all available snapshots, shows metadata, and provides
 * one-click rollback to restore a plant database to a prior state.
 *
 * KEY FEATURES:
 *   - Snapshot list: all saved snapshots with date, size, and trigger type
 *   - Trigger types: Manual / Auto (nightly) / Pre-import / Pre-migration
 *   - Rollback: restore plant DB to any snapshot with double-confirm dialog
 *   - Create snapshot: manually trigger a new snapshot before risky changes
 *   - Delete snapshot: remove outdated snapshots to reclaim disk space
 *   - Safety locks: rollback disabled if any active WOs are currently open
 *   - Audit log: all rollback operations logged with actor, timestamp, reason
 *
 * ROLLBACK BEHAVIOR:
 *   Replaces the plant SQLite DB file with the snapshot binary.
 *   Current data after the snapshot timestamp is permanently lost.
 *   Server restarts the DB connection pool after rollback completes.
 *
 * API CALLS:
 *   GET    /api/database/snapshots              — List snapshots for plant
 *   POST   /api/database/snapshots              — Create new snapshot
 *   POST   /api/database/snapshots/:id/rollback — Restore to snapshot
 *   DELETE /api/database/snapshots/:id          — Delete snapshot
 *
 * @param {string} selectedPlant — Plant whose snapshots are displayed
 * @param {string} currentPlant  — Active plant context (for rollback targeting)
 */
import React, { useState, useEffect } from 'react';
import { History, RotateCcw, Database, Calendar, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function SnapshotRollbackView({ selectedPlant, currentPlant }) {
    const { t } = useTranslation();
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [restoring, setRestoring] = useState(null);

    const fetchSnapshots = () => {
        setLoading(true);
        fetch(`/api/database/snapshots?plantId=${selectedPlant}`)
            .then(res => res.json())
            .then(data => {
                setSnapshots(data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load snapshots', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchSnapshots();
    }, [selectedPlant]);

    const handleRestore = async (snapshotFile) => {
        const confirmMsg = `CRITICAL WARNING: This will overwrite the current active database for ${currentPlant.label} with the data from ${snapshotFile}.\n\nCurrent work orders and changes since this snapshot was taken will be LOST.\n\nAre you sure you want to proceed?`;
        if (!await confirm(confirmMsg)) return;

        setRestoring(snapshotFile);
        setStatus({ type: '', message: '' });

        try {
            const res = await fetch('/api/database/restore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': localStorage.getItem('userRole'),
                    'x-is-creator': localStorage.getItem('PF_USER_IS_CREATOR')
                },
                body: JSON.stringify({ snapshotFile })
            });

            const data = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', message: 'System rollback successful. Reloading...' });
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setStatus({ type: 'error', message: data.error || 'Rollback failed' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Network error during restoration' });
        }
        setRestoring(null);
    };

    return (
        <div className="panel-box" style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <History size={18} color="var(--primary)" /> {t('snapshot.rollback.rollbackSnapshots')}
                </h3>
                <button onClick={fetchSnapshots} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} title={t('snapshotRollbackView.reloadTheListOfAvailableTip')}>{t('snapshot.rollback.refresh')}</button>
            </div>

            {status.message && (
                <div style={{
                    background: status.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                    color: status.type === 'error' ? '#f87171' : '#34d399',
                    padding: '10px', borderRadius: '8px', border: '1px solid currentColor', fontSize: '0.85rem'
                }}>
                    {status.message}
                </div>
            )}

            <div className="scroll-area" style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '5px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('snapshot.rollback.loadingHistory')}</p>
                ) : snapshots.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('snapshot.rollback.noSnapshotsAvailableFor')}</p>
                ) : snapshots.map(snap => (
                    <div key={snap.filename} style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: snap.filename.includes('IMPORT') ? '#ec4899' : 'inherit' }}>
                                {snap.filename.includes('IMPORT') ? '📦 Pre-Import Snap' : '💾 Manual Backup'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Calendar size={12} /> {new Date(snap.created).toLocaleString()} 
                                <span style={{ opacity: 0.5 }}>|</span>
                                <Database size={12} /> {(snap.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                        </div>
                        <button 
                            onClick={() => handleRestore(snap.filename)}
                            className="btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid #60a5fa' }}
                            disabled={restoring}
                            title={t('snapshotRollbackView.restoreTheDatabaseToThisTip')}
                        >
                            <RotateCcw size={14} style={{ marginRight: '6px' }} /> 
                            {restoring === snap.filename ? 'Restoring...' : 'Rollback'}
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'start', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                <span>{t('snapshot.rollback.snapshotsAreStoredOn')} <strong>{t('snapshotRollbackView.absoluteRevert')}</strong> {t('snapshotRollbackView.ofTheOperationalDatabaseFor')}</span>
            </div>
        </div>
    );
}
