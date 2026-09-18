// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Selection and bulk deletion for the four enterprise IT asset inventories.
 * POST /api/it/:category/bulk-delete receives explicit IDs and observed sites.
 * Only DELETED item results clear selection; failures remain visible for retry.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function useITBulkSelection({ category, search, rows, enabled, onDeleted }) {
    const [selected, setSelected] = useState(new Set());
    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => { setSelected(new Set()); setPending(null); setMessage(''); }, [category, search]);
    const selectedRows = rows.filter(row => selected.has(row.ID));
    const toggle = id => setSelected(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const execute = async () => {
        if (!pending || busy) return;
        setBusy(true); setMessage('');
        const deleted = new Set();
        let requestError = '';
        try {
            for (let start = 0; start < pending.length; start += 500) {
                const batch = pending.slice(start, start + 500);
                const response = await fetch(`/api/it/${category}/bulk-delete`, { method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: batch.map(row => ({ ID: row.ID, PlantID: row.PlantID ?? null })) }),
                });
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.results)) throw new Error(data.error || 'Invalid deletion response.');
                for (const row of batch) {
                    const matches = data.results.filter(item => item.id === row.ID);
                    if (matches.length === 1 && matches[0].status === 'DELETED') deleted.add(row.ID);
                }
            }
        } catch (error) { requestError = error.message; }
        finally {
            const remaining = pending.length - deleted.size;
            setSelected(new Set(pending.filter(row => !deleted.has(row.ID)).map(row => row.ID)));
            setMessage(`${deleted.size} deleted. ${remaining} not deleted or unverified.${remaining ? ' Remaining selections are kept; refresh before retrying if an asset moved.' : ''}${requestError ? ' ' + requestError : ''}`);
            if (deleted.size) onDeleted(deleted);
            setPending(null); setBusy(false);
        }
    };
    const bySite = (pending || []).reduce((counts, row) => {
        const site = row.PlantID || 'Unassigned'; counts[site] = (counts[site] || 0) + 1; return counts;
    }, {});
    return {
        header: enabled ? <th><input type="checkbox" aria-label="Select all filtered assets" disabled={busy || rows.length === 0}
            checked={rows.length > 0 && selectedRows.length === rows.length}
            ref={element => { if (element) element.indeterminate = selectedRows.length > 0 && selectedRows.length < rows.length; }}
            onChange={() => setSelected(selectedRows.length === rows.length ? new Set() : new Set(rows.map(row => row.ID)))} /></th> : null,
        cell: row => enabled ? <td><input type="checkbox" aria-label={`Select ${row.Name}`} checked={selected.has(row.ID)} disabled={busy} onChange={() => toggle(row.ID)} /></td> : null,
        toolbar: enabled ? <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <span>{selectedRows.length} selected in filtered results</span>
                <button className="btn-danger" disabled={selectedRows.length === 0 || busy} onClick={() => setPending([...selectedRows])}>Delete selected ({selectedRows.length})</button>
            </div>
            {message && <p role="status">{message}</p>}
            {pending && createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#000b', display: 'grid', placeItems: 'center', padding: 16 }}>
                <section role="dialog" aria-modal="true" aria-label="Confirm bulk deletion" className="glass-card" style={{ padding: 24, maxWidth: 540, maxHeight: '85vh', overflowY: 'auto', background: '#101827', color: '#e2e8f0' }}>
                    <h3>Delete {pending.length} selected {category} assets?</h3>
                    <p>This permanently removes the selected assets and their current assignments. Movement and work-order history is retained.</p>
                    <ul>{Object.entries(bySite).map(([site, n]) => <li key={site}>{site}: {n}</li>)}</ul>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn-secondary" autoFocus disabled={busy} onClick={() => setPending(null)}>Cancel</button>
                        <button className="btn-danger" disabled={busy} onClick={execute}>{busy ? 'Deleting…' : `Permanently delete ${pending.length}`}</button>
                    </div>
                </section>
            </div>, document.body)}
        </> : null,
    };
}
