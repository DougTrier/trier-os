// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * PlantResetPanel — verified administrative site reset.
 * Keeps the displayed site, preview and confirmation bound to one explicit ID.
 * API: POST /api/database/reset-plant (dryRun preview or confirmed execution).
 * Both entry points share this panel so reset safeguards cannot drift apart.
 */
import React, { useEffect, useState } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';

export default function PlantResetPanel({ currentPlant }) {
    const plantId = currentPlant?.id;
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState(null);
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const valid = !!plantId && plantId !== 'all_sites';

    useEffect(() => {
        let cancelled = false;
        setName(''); setCode(''); setPreview(null); setResult(null); setError('');
        if (open && valid) {
            fetch('/api/database/reset-plant', { method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ dryRun: true }),
            }).then(async response => {
                const data = await response.json();
                if (!response.ok || !data.success || data.plant !== plantId) throw new Error(data.error || 'Unable to preview this site.');
                if (!cancelled) setPreview(data);
            }).catch(e => { if (!cancelled) setError(e.message); });
        }
        return () => { cancelled = true; };
    }, [plantId, open, valid]);

    const canReset = preview && (name === preview.plantLabel || name === plantId) && code === 'RESET-CONFIRMED' && !busy && !result;
    const execute = async () => {
        if (!canReset) return;
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/database/reset-plant', { method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({ confirmPlantName: name }),
            });
            const data = await response.json();
            if (!response.ok || !data.success || data.plant !== plantId || data.remainingRecords !== 0) throw new Error(data.error || 'Reset was not verified.');
            setResult(data); setName(''); setCode('');
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };
    return <section className="panel-box" style={{ padding: 20, borderRadius: 12, border: '1px solid #ef444466', background: '#ef444408' }}>
        <h3 style={{ color: '#ef4444', display: 'flex', gap: 8, alignItems: 'center' }}><Trash2 size={18} /> Plant data reset</h3>
        <p>Clear operational data in the selected plant database, plus IT assets and contracts assigned to that site.</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Reference tables, user accounts, corporate catalogs, local event and replication history, and shared safety, audit, movement and work-order history are retained. Both affected databases are backed up first.</p>
        {!valid && <p role="status">Select one plant in the database selector to preview its reset.</p>}
        {!open && <button className="btn-secondary" disabled={!valid} onClick={() => setOpen(true)}>Show reset options</button>}
        {open && <>
            <h4>{preview?.plantLabel || currentPlant?.label || plantId}</h4>
            {!preview && !error && <p role="status">Loading reset preview…</p>}
            {preview && <>
                <p><strong>{preview.totalRows.toLocaleString()} records currently targeted.</strong> Counts are checked again during execution.</p>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
                    <table className="data-table"><thead><tr><th>Data table</th><th>Records</th></tr></thead>
                        <tbody>{Object.entries(result?.deleted || preview.counts).filter(([, n]) => n > 0).map(([table, n]) => <tr key={table}><td>{table}</td><td>{n.toLocaleString()}</td></tr>)}</tbody>
                    </table>
                </div>
                <label style={{ display: 'block', marginBottom: 12 }}>Type “{preview.plantLabel}” to confirm
                    <input aria-label="Confirm selected plant" value={name} disabled={busy || !!result} onChange={e => setName(e.target.value)} style={{ display: 'block', width: '100%', padding: 8 }} />
                </label>
                <label style={{ display: 'block', marginBottom: 12 }}>Type “RESET-CONFIRMED” to proceed
                    <input aria-label="Confirm permanent reset" value={code} disabled={busy || !!result} onChange={e => setCode(e.target.value)} style={{ display: 'block', width: '100%', padding: 8 }} />
                </label>
                <button className="btn-danger" disabled={!canReset} onClick={execute}>{busy ? <><RefreshCw size={14} /> Resetting…</> : 'Execute reset'}</button>
            </>}
            <button className="btn-secondary" disabled={busy} onClick={() => setOpen(false)} style={{ marginLeft: 8 }}>Close reset options</button>
        </>}
        {error && <p role="alert" style={{ color: '#f87171' }}>{error}</p>}
        {result && <div role="status" style={{ overflowWrap: 'anywhere' }}>
            <p>{result.message}</p><p>Plant backup: {result.snapshotFile}<br />Shared IT backup: {result.logisticsSnapshotFile}</p>
            <button className="btn-secondary" onClick={() => window.location.reload()}>Reload data</button>
        </div>}
    </section>;
}
