// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect } from 'react';
import { Leaf, Download, Settings, Factory, Activity, X } from 'lucide-react';

export default function EmissionsView({ plantId, plantLabel }) {
    const [year, setYear] = useState(new Date().getFullYear());
    const [summary, setSummary] = useState(null);
    const [intensity, setIntensity] = useState(null);
    const [corpRollup, setCorpRollup] = useState(null);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Modals
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showProductionModal, setShowProductionModal] = useState(false);
    
    // Forms
    const [configForm, setConfigForm] = useState({ gridIntensity: '', gridRegion: '' });
    const [prodForm, setProdForm] = useState({ periodStart: '', periodEnd: '', volume: '', unit: 'tonnes' });
    const [saving, setSaving] = useState(false);

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const fetchData = async () => {
        setLoading(true);
        const headers = { 'Content-Type': 'application/json', 'x-plant-id': plantId };
        const corpHeaders = { 'Content-Type': 'application/json', 'x-plant-id': 'all_sites' };

        try {
            const [sumRes, intRes, corpRes, confRes] = await Promise.all([
                fetch(`/api/emissions/summary?plantId=${plantId}&startDate=${startDate}&endDate=${endDate}`, { headers }),
                fetch(`/api/emissions/intensity?plantId=${plantId}&startDate=${startDate}&endDate=${endDate}`, { headers }),
                fetch(`/api/emissions/corp-rollup?startDate=${startDate}&endDate=${endDate}`, { headers: corpHeaders }),
                fetch(`/api/emissions/config?plantId=${plantId}`, { headers })
            ]);

            setSummary(sumRes.ok ? await sumRes.json() : null);
            setIntensity(intRes.ok ? await intRes.json() : null);
            setCorpRollup(corpRes.ok ? await corpRes.json() : null);
            
            if (confRes.ok) {
                const confData = await confRes.json();
                setConfig(confData);
            }
        } catch (err) {
            console.error('Failed to fetch emissions data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (plantId) fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plantId, year]);

    const handleExportCSV = async () => {
        try {
            const url = `/api/emissions/report?plantId=${plantId}&startDate=${startDate}&endDate=${endDate}&format=csv`;
            const headers = { 'x-plant-id': plantId };
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('Export failed');
            
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `emissions-${plantId}-${year}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export CSV');
        }
    };

    const handleOpenConfig = () => {
        setConfigForm({
            gridIntensity: config?.gridIntensity ?? 0.417,
            gridRegion: config?.gridRegion ?? ''
        });
        setShowConfigModal(true);
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        const intensityVal = parseFloat(configForm.gridIntensity);
        if (isNaN(intensityVal) || intensityVal <= 0 || intensityVal > 5) {
            alert('Grid Intensity must be between 0 and 5 kg/kWh');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/emissions/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    plantId,
                    gridIntensity: intensityVal,
                    gridRegion: configForm.gridRegion || null
                })
            });
            if (res.ok) {
                setShowConfigModal(false);
                fetchData();
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            alert('Failed to save config');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProduction = async (e) => {
        e.preventDefault();
        const vol = parseFloat(prodForm.volume);
        if (isNaN(vol) || vol <= 0) {
            alert('Volume must be a positive number');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/emissions/production', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId },
                body: JSON.stringify({
                    plantId,
                    periodStart: prodForm.periodStart,
                    periodEnd: prodForm.periodEnd,
                    volume: vol,
                    unit: prodForm.unit
                })
            });
            if (res.ok) {
                setShowProductionModal(false);
                setProdForm({ periodStart: '', periodEnd: '', volume: '', unit: 'tonnes' });
                fetchData();
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            alert('Failed to log production');
        } finally {
            setSaving(false);
        }
    };

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '0 8px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Section 1: Header bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)' }}>
                        <Leaf size={26} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9' }}>Emissions & Carbon Intensity</h1>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>{plantLabel}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value, 10))}
                        className="form-input"
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', cursor: 'pointer' }}
                    >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button className="btn-secondary" onClick={() => setShowProductionModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Factory size={14} /> Log Production
                    </button>
                    <button className="btn-secondary" onClick={handleOpenConfig} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Settings size={14} /> Grid Config
                    </button>
                    <button className="btn-primary" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Loading ESG metrics...</div>
            ) : (
                <>
                    {/* Section 2: KPI Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <div className="glass-card" style={{ padding: '20px', borderTop: '3px solid #ef4444' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Scope 1 (Direct Emissions)</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9' }}>
                                {summary?.scope1_kg?.toLocaleString() || 0} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>kg CO₂e</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>Direct combustion — fuel, gas, propane</div>
                        </div>

                        <div className="glass-card" style={{ padding: '20px', borderTop: '3px solid #f59e0b' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Scope 2 (Electricity)</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9' }}>
                                {summary?.scope2_kg?.toLocaleString() || 0} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>kg CO₂e</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>Grid intensity: {summary?.grid_intensity_used ?? 0.417} kg/kWh</div>
                        </div>

                        <div className="glass-card" style={{ padding: '20px', borderTop: '3px solid #10b981' }}>
                            <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Carbon Intensity</div>
                            {intensity?.intensity_kg_per_unit != null ? (
                                <>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>
                                        {intensity.intensity_kg_per_unit.toFixed(3)} <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>kg CO₂e / {intensity.unit}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>Based on total Scope 1 + 2</div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>No production data logged for this period.</div>
                                    <button onClick={() => setShowProductionModal(true)} style={{ background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '4px 12px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', width: 'fit-content' }}>
                                        Log Production
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 3: Scope 1 Source Breakdown */}
                    <div className="glass-card" style={{ padding: '20px' }}>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f1f5f9' }}>Scope 1 Source Breakdown</h2>
                        {!summary?.scope1_sources || summary.scope1_sources.length === 0 ? (
                            <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', padding: '10px 0' }}>No Scope 1 fuel readings for this period</div>
                        ) : (
                            <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        <th>Meter Type</th>
                                        <th>Reading (Usage)</th>
                                        <th>Emission Factor</th>
                                        <th>Emissions (kg CO₂e)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.scope1_sources.map((s, i) => (
                                        <tr key={i}>
                                            <td style={{ color: '#e2e8f0', fontWeight: 500 }}>
                                                {(s.meterType || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </td>
                                            <td style={{ color: '#94a3b8' }}>{s.reading}</td>
                                            <td style={{ color: '#94a3b8' }}>{s.factorUsed}</td>
                                            <td style={{ color: '#ef4444', fontWeight: 600 }}>{s.emissions_kg?.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Section 4: Corporate Emissions Rollup */}
                    {corpRollup && (
                        <div className="glass-card" style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9' }}>Enterprise Rollup — All Sites</h2>
                                <div style={{ fontSize: '0.85rem', background: 'rgba(15,23,42,0.6)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: '#94a3b8' }}>Total: </span>
                                    <span style={{ color: '#f1f5f9', fontWeight: 700, marginRight: '12px' }}>{corpRollup.corporate_total_kg?.toLocaleString() || 0} kg CO₂e</span>
                                    <span style={{ color: '#64748b' }}>| Prior Year: </span>
                                    <span style={{ color: '#cbd5e1', marginRight: '12px' }}>{corpRollup.prior_year_total_kg?.toLocaleString() || 0}</span>
                                    <span style={{ color: '#64748b' }}>| Change: </span>
                                    <span style={{ 
                                        color: (corpRollup.change_pct || 0) < 0 ? '#10b981' : (corpRollup.change_pct || 0) > 0 ? '#ef4444' : '#94a3b8',
                                        fontWeight: 700
                                    }}>
                                        {(corpRollup.change_pct || 0).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                            
                            {(!corpRollup.plants || corpRollup.plants.length === 0) ? (
                                <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', padding: '10px 0' }}>No corporate rollup data available</div>
                            ) : (
                                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th>Plant</th>
                                            <th>Scope 1 (kg CO₂e)</th>
                                            <th>Scope 2 (kg CO₂e)</th>
                                            <th>Total (kg CO₂e)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {corpRollup.plants.map((p, i) => (
                                            <tr key={i}>
                                                <td style={{ color: '#e2e8f0', fontWeight: 600 }}>{(p.plantId || '').replace(/_/g, ' ')}</td>
                                                <td style={{ color: '#ef4444' }}>{p.scope1_kg?.toLocaleString() || 0}</td>
                                                <td style={{ color: '#f59e0b' }}>{p.scope2_kg?.toLocaleString() || 0}</td>
                                                <td style={{ color: '#f1f5f9', fontWeight: 700 }}>{p.total_kg?.toLocaleString() || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Grid Config Modal */}
            {showConfigModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '400px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>Grid Configuration</h2>
                            <button onClick={() => setShowConfigModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Grid Intensity (kg CO₂e / kWh)</label>
                                <input required type="number" step="0.001" min="0.001" max="5" value={configForm.gridIntensity} onChange={e => setConfigForm(f => ({...f, gridIntensity: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Grid Region</label>
                                <input type="text" placeholder="e.g. MISO, WECC, PJM" value={configForm.gridRegion} onChange={e => setConfigForm(f => ({...f, gridRegion: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            <button type="submit" disabled={saving} className="btn-primary" style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Log Production Modal */}
            {showProductionModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', width: '400px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>Log Production Volume</h2>
                            <button onClick={() => setShowProductionModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveProduction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Period Start</label>
                                    <input required type="date" value={prodForm.periodStart} onChange={e => setProdForm(f => ({...f, periodStart: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', colorScheme: 'dark' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Period End</label>
                                    <input required type="date" value={prodForm.periodEnd} onChange={e => setProdForm(f => ({...f, periodEnd: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', colorScheme: 'dark' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Volume</label>
                                <input required type="number" step="any" min="0.001" value={prodForm.volume} onChange={e => setProdForm(f => ({...f, volume: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: '#cbd5e1' }}>Unit</label>
                                <select value={prodForm.unit} onChange={e => setProdForm(f => ({...f, unit: e.target.value}))} className="form-input" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}>
                                    <option value="tonnes">Tonnes</option>
                                    <option value="kg">Kilograms</option>
                                    <option value="units">Units</option>
                                    <option value="litres">Litres</option>
                                    <option value="barrels">Barrels</option>
                                    <option value="MWh">MWh</option>
                                </select>
                            </div>
                            <button type="submit" disabled={saving} className="btn-primary" style={{ width: '100%', padding: '10px', marginTop: '8px', borderRadius: '6px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? 'Saving...' : 'Save Production'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
