// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect, useMemo } from 'react';
import { Shield, ShieldAlert, CheckCircle, XCircle, Search, RefreshCw, Copy, Info, Database as DatabaseIcon } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const makeAPI = (plantId) => async (path) => {
    const res = await fetch(path, {
        headers: {
            'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
        }
    });
    if (!res.ok) {
        throw new Error('API Request Failed');
    }
    return res.json();
};

export default function GatekeeperAuditView({ plantId }) {
    const { t } = useTranslation();
    const API = useMemo(() => makeAPI(plantId), [plantId]);

    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [integrity, setIntegrity] = useState(null);
    const [loading, setLoading] = useState(true);

    const [verifyHashInput, setVerifyHashInput] = useState('');
    const [verifyResult, setVerifyResult] = useState(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const [filters, setFilters] = useState({
        actionType: '',
        validationResult: '',
        from: '',
        to: ''
    });

    const [pagination, setPagination] = useState({
        offset: 0,
        limit: 50
    });

    const [expandedRow, setExpandedRow] = useState(null);

    const ACTION_TYPES = [
        'LOTO_ACTIVATE', 'LOTO_VOID', 'SETPOINT_WRITE', 'SAFETY_PARAM_CHANGE', 
        'MOC_APPROVE', 'MOC_CLOSE', 'PTW_ISSUE', 'PTW_REVOKE'
    ]; // Can be extended

    const fetchAudit = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: pagination.limit,
                offset: pagination.offset
            });
            if (plantId && plantId !== 'all_sites') params.append('plantId', plantId);
            if (filters.actionType) params.append('actionType', filters.actionType);
            if (filters.validationResult) params.append('validationResult', filters.validationResult);
            if (filters.from) params.append('from', filters.from);
            if (filters.to) params.append('to', filters.to);

            const res = await API(`/api/gatekeeper/audit?${params.toString()}`);
            setRecords(res.records || []);
            setTotal(res.total || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchIntegrity = async () => {
        try {
            const res = await API('/api/gatekeeper/audit/integrity');
            setIntegrity(res);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchIntegrity();
    }, [API]);

    useEffect(() => {
        fetchAudit();
    }, [API, filters, pagination.offset]);

    const handleFilterChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setPagination(prev => ({ ...prev, offset: 0 })); // reset to page 1
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        if (window.trierToast) window.trierToast.success('Copied to clipboard');
    };

    const handleVerifyHash = async () => {
        if (!verifyHashInput.trim()) return;
        setIsVerifying(true);
        setVerifyResult(null);
        try {
            const res = await fetch('/api/gatekeeper/audit/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-plant-id': plantId || localStorage.getItem('selectedPlantId') || 'Demo_Plant_1' },
                body: JSON.stringify({ hash: verifyHashInput })
            });
            const data = await res.json();
            setVerifyResult(data);
        } catch (err) {
            setVerifyResult({ valid: false, message: 'Request failed' });
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="module-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Shield className="text-indigo-400" size={28} />
                        Safe Action Certification Ledger
                    </h1>
                    <p style={{ color: '#94a3b8', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                        Immutable audit log of all safety-critical write actions and pre-execution simulation proofs.
                    </p>
                </div>
                <button onClick={() => fetchAudit()} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Verify Hash Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(99, 102, 241, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <div style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 600 }}>Verify Cryptographic Receipt</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <input 
                        type="text" 
                        value={verifyHashInput} 
                        onChange={e => setVerifyHashInput(e.target.value)} 
                        placeholder="Paste SHA-256 CertHash here to verify..." 
                        style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.85rem' }} 
                    />
                    <button 
                        onClick={handleVerifyHash} 
                        disabled={isVerifying || !verifyHashInput.trim()} 
                        style={{ padding: '8px 20px', background: verifyHashInput.trim() ? '#4f46e5' : 'rgba(255,255,255,0.05)', color: verifyHashInput.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: '6px', cursor: verifyHashInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                    >
                        {isVerifying ? <RefreshCw size={14} className="spin" /> : <Shield size={14} />} Verify
                    </button>
                </div>
                {verifyResult && (
                    <div style={{ padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem', background: verifyResult.valid ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)', color: verifyResult.valid ? '#34d399' : '#f87171', border: `1px solid ${verifyResult.valid ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {verifyResult.valid ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        {verifyResult.message}
                        {verifyResult.valid && verifyResult.details && (
                            <span style={{ marginLeft: '12px', color: '#cbd5e1', fontSize: '0.8rem' }}>
                                Action: <strong style={{color:'#fff'}}>{verifyResult.details.ActionType}</strong> by <strong style={{color:'#fff'}}>{verifyResult.details.Username}</strong> on {new Date(verifyResult.details.Timestamp).toLocaleString()}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <select name="actionType" value={filters.actionType} onChange={handleFilterChange} className="input">
                    <option value="">All Action Types</option>
                    {ACTION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select name="validationResult" value={filters.validationResult} onChange={handleFilterChange} className="input">
                    <option value="">All Results</option>
                    <option value="ALLOWED">ALLOWED</option>
                    <option value="DENIED">DENIED</option>
                </select>
                <input type="date" name="from" value={filters.from} onChange={handleFilterChange} className="input" title="From Date" />
                <input type="date" name="to" value={filters.to} onChange={handleFilterChange} className="input" title="To Date" />
            </div>

            {/* Main Table */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Timestamp</th>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>User</th>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Action</th>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Target</th>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Result</th>
                            <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600 }}>Time (ms)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.length === 0 && !loading && (
                            <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No records found.</td></tr>
                        )}
                        {records.map(rec => (
                            <React.Fragment key={rec.LedgerID}>
                                <tr 
                                    onClick={() => setExpandedRow(expandedRow === rec.LedgerID ? null : rec.LedgerID)}
                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: expandedRow === rec.LedgerID ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                                    className="hover:bg-white/5"
                                >
                                    <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{new Date(rec.Timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '12px 16px' }}>{rec.Username}</td>
                                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#818cf8' }}>{rec.ActionType}</td>
                                    <td style={{ padding: '12px 16px' }}>{rec.TargetID || '-'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {rec.ValidationResult === 'ALLOWED' ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                <CheckCircle size={14} /> ALLOWED
                                            </span>
                                        ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                                                <XCircle size={14} /> DENIED
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{rec.ProcessingMs}</td>
                                </tr>
                                
                                {expandedRow === rec.LedgerID && (
                                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                        <td colSpan={6} style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                {/* Request Details */}
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#e2e8f0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Request Context</h4>
                                                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <div><span style={{ display: 'inline-block', width: '100px' }}>Request ID:</span> <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{rec.RequestID}</span></div>
                                                        <div><span style={{ display: 'inline-block', width: '100px' }}>Plant:</span> <span style={{ color: '#e2e8f0' }}>{rec.PlantID}</span></div>
                                                        {rec.PTWRef && <div><span style={{ display: 'inline-block', width: '100px' }}>PTW Ref:</span> <span style={{ color: '#e2e8f0' }}>{rec.PTWRef}</span></div>}
                                                        {rec.MOCRef && <div><span style={{ display: 'inline-block', width: '100px' }}>MOC Ref:</span> <span style={{ color: '#e2e8f0' }}>{rec.MOCRef}</span></div>}
                                                        {rec.DenialReason && <div><span style={{ display: 'inline-block', width: '100px' }}>Denial Reason:</span> <span style={{ color: '#f87171' }}>{rec.DenialReason}</span></div>}
                                                    </div>
                                                </div>

                                                {/* Proof Receipt Details */}
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#e2e8f0', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proof Receipt</h4>
                                                    {rec.Certified !== null && rec.Certified !== undefined ? (
                                                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                            {rec.Certified === 1 ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', marginBottom: '8px', fontWeight: 600 }}>
                                                                    <Shield size={18} /> CERTIFIED SAFE
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', marginBottom: '8px', fontWeight: 600 }}>
                                                                    <ShieldAlert size={18} /> BLOCKED BY CONSTRAINTS
                                                                </div>
                                                            )}
                                                            
                                                            {rec.CertHash && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                                                    <div 
                                                                        title={rec.CertHash}
                                                                        style={{ 
                                                                            fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(0,0,0,0.3)', 
                                                                            padding: '4px 8px', borderRadius: '4px', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)',
                                                                            display: 'flex', alignItems: 'center', gap: '8px'
                                                                        }}
                                                                    >
                                                                        {rec.CertHash.substring(0, 8)}...{rec.CertHash.substring(rec.CertHash.length - 4)}
                                                                        <Copy 
                                                                            size={14} 
                                                                            style={{ cursor: 'pointer', color: '#94a3b8' }} 
                                                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(rec.CertHash); }} 
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {rec.CausalExplanation && (
                                                                <div style={{ fontSize: '0.85rem', color: '#fca5a5', background: 'rgba(248, 113, 113, 0.1)', padding: '8px', borderRadius: '4px', marginBottom: '8px', borderLeft: '2px solid #f87171' }}>
                                                                    {rec.CausalExplanation}
                                                                </div>
                                                            )}

                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                {rec.ConstraintsPassed && (() => {
                                                                    try {
                                                                        const parsed = JSON.parse(rec.ConstraintsPassed);
                                                                        return parsed.map(c => (
                                                                            <span key={c} style={{ fontSize: '0.75rem', background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                                                                                ✓ {c}
                                                                            </span>
                                                                        ));
                                                                    } catch { return null; }
                                                                })()}
                                                                {rec.ConstraintsFailed && (() => {
                                                                    try {
                                                                        const parsed = JSON.parse(rec.ConstraintsFailed);
                                                                        return parsed.map(c => (
                                                                            <span key={c} style={{ fontSize: '0.75rem', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                                                                                ✗ {c}
                                                                            </span>
                                                                        ));
                                                                    } catch { return null; }
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                            No Proof Receipt attached. (Legacy record or unregulated action)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination & Integrity Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <DatabaseIcon size={16} className={integrity?.integrityStatus === 'OK' ? 'text-green-400' : 'text-red-400'} />
                        <span style={{ color: '#cbd5e1' }}>Ledger Integrity:</span>
                        <span style={{ fontWeight: 600, color: integrity?.integrityStatus === 'OK' ? '#34d399' : '#f87171' }}>
                            {integrity?.integrityStatus || 'CHECKING...'}
                        </span>
                    </div>
                    {integrity && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {integrity.totalRecords.toLocaleString()} verified ledger records
                        </div>
                    )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Showing {records.length > 0 ? pagination.offset + 1 : 0} - {pagination.offset + records.length} of {total}
                    </span>
                    <button 
                        disabled={pagination.offset === 0}
                        onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                        className="btn"
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                        Prev
                    </button>
                    <button 
                        disabled={pagination.offset + records.length >= total}
                        onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                        className="btn"
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
