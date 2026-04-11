// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Data Bridge Import Wizard
 * =======================================
 * Step-by-step wizard for migrating legacy Enterprise System data into Trier OS.
 * Wraps the DataBridge component in a lightweight wizard shell and also
 * handles direct CSV/Excel uploads for smaller data sets.
 *
 * SUPPORTED SOURCES:
 *   Microsoft Access (.mdb/.accdb)  — MP2, Tabware, Maximo, Express Maintenance
 *   SQL Server                       — Direct database connection (read-only)
 *   CSV / Excel                      — Simple flat file upload with column mapper
 *   Generic API                      — REST endpoint import (JSON response mapping)
 *
 * WIZARD STEPS (for CSV/Excel path):
 *   1. Select Source    — Choose file type or data source connection
 *   2. Upload / Connect — Upload file (Papa.parse for CSV) or test connection
 *   3. Map Columns      — Drag-and-drop column mapping to Trier OS schema fields
 *   4. Validate         — Preview mapped rows, flag validation errors
 *   5. Conflict Rules   — Choose import strategy: fullest-record-wins / overwrite / merge
 *   6. Import           — Execute with progress bar and per-record error log
 *
 * For Access/SQL sources, delegates to DataBridge.jsx for the full mapping UI.
 * For CSV/Excel, uses Papa.parse for client-side parsing before sending to server.
 *
 * @param {string}   currentPlant — Plant receiving the imported data
 * @param {Function} onComplete   — Callback fired after successful import
 * @param {string}   userRole     — Used to gate Access/SQL import to IT Admin+
 */
import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle, AlertTriangle, ArrowRight, Database } from 'lucide-react';
import DataBridge from './DataBridge';
import { useTranslation } from '../i18n/index.jsx';

export default function ImportWizard({ currentPlant, onComplete, userRole }) {
    const { t } = useTranslation();
    const [importMode, setImportMode] = useState('select'); // 'select', 'csv', 'Enterprise System'
    const [step, setStep] = useState(1);
    const [file, setFile] = useState(null);
    const [csvData, setCsvData] = useState([]);
    const [csvHeaders, setCsvHeaders] = useState([]);

    // Target fields we map to in the database (Vibe Native Schema)
    const targetFields = {
        'AssetID': 'Asset ID / Barcode (Required)',
        'Description': 'Description',
        'Model': 'Model Number',
        'Manufacturer': 'Manufacturer / Make',
        'Serial': 'Serial Number',
        'LocationID': 'Location Code',
        'DeptID': 'Department Code',
        'Quantity': 'Quantity (Optional)',
        'OperationalStatus': 'Operational Status (Optional)'
    };

    const [mapping, setMapping] = useState({});
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);

    // Safety check explicit confirmation
    const [confirmPlant, setConfirmPlant] = useState('');

    const fileInputRef = useRef();

    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);

        Papa.parse(uploadedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.meta.fields) {
                    setCsvHeaders(results.meta.fields);
                    setCsvData(results.data);

                    // Auto-map where exact matches occur
                    const autoMap = {};
                    results.meta.fields.forEach(h => {
                        const match = Object.keys(targetFields).find(t => t.toLowerCase() === h.toLowerCase());
                        if (match) autoMap[match] = h;
                    });
                    setMapping(autoMap);

                    setStep(2);
                } else {
                    setError('Invalid CSV file format.');
                }
            },
            error: (err) => {
                setError('Error reading file: ' + err.message);
            }
        });
    };

    const handleImport = async () => {
        if (confirmPlant !== currentPlant.id && confirmPlant !== currentPlant.label) {
            setError(`Safety check failed. Type "${currentPlant.label}" to confirm.`);
            return;
        }

        if (!mapping['AssetID']) {
            setError('You must map a required field for the Asset ID.');
            return;
        }

        setIsUploading(true);
        setError(null);

        // Map the array
        const importedPayload = csvData.map(row => {
            const mappedObj = {};
            Object.keys(mapping).forEach(targetKey => {
                const csvCol = mapping[targetKey];
                mappedObj[targetKey] = row[csvCol];
            });
            return mappedObj;
        });

        try {
            const res = await fetch('/api/database/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetTable: 'Asset',
                    data: importedPayload
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setStep(4);
            } else {
                setError(data.error || 'Failed to import to database.');
            }
        } catch (err) {
            setError('Network error during database import.');
        }
        setIsUploading(false);
    };

    return (
        <div className="glass-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255,255,255,0.03)' }}>
            
            {/* ── MODE SELECTOR ── */}
            {importMode === 'select' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <UploadCloud size={20} color="var(--primary)" />
                            {t('import.universalDataImporter')}
                        </h3>
                        <div className="badge badge-gray" style={{ fontSize: '0.75rem' }}>Current Site: {currentPlant.label}</div>
                    </div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        Choose how you'd like to import data into {currentPlant.label}:
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <button 
                            onClick={() => setImportMode('csv')}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                padding: '30px 20px', borderRadius: '14px', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                                transition: 'all 0.3s ease', gap: '12px'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#818cf8'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99,102,241,0.15)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            title={t('importWizard.uploadACsvFileAndTip')}
                        >
                            <UploadCloud size={36} color="var(--primary)" />
                            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', fontFamily: "'Outfit', sans-serif" }}>{t('import.csvUpload')}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
                                Upload a .csv file and map columns manually. Best for spreadsheets and one-off imports.
                            </span>
                        </button>
                        
                        <button 
                            onClick={() => setImportMode('Enterprise System')}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                padding: '30px 20px', borderRadius: '14px', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                                transition: 'all 0.3s ease', gap: '12px'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(16,185,129,0.15)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            title={t('importWizard.connectDirectlyToPmcMp2Tip')}
                        >
                            <Database size={36} color="#10b981" />
                            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', fontFamily: "'Outfit', sans-serif" }}>{t('import.cmmsDataBridge')}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: '1.4' }}>
                                Connect directly to PMC, MP2, Express, Access, SQL, or API sources. Auto-maps columns.
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Enterprise System DATA BRIDGE MODE ── */}
            {importMode === 'Enterprise System' && (
                <div>
                    <button
                        className="btn-secondary"
                        onClick={() => setImportMode('select')}
                        style={{ padding: '6px 14px', fontSize: '0.8rem', marginBottom: '10px' }}
                        title={t('importWizard.returnToTheImportMethodTip')}
                    >
                        ← Back to Import Options
                    </button>
                    <DataBridge currentPlant={currentPlant} userRole={userRole} onComplete={onComplete} />
                </div>
            )}

            {/* ── CSV IMPORT MODE (Original Logic) ── */}
            {importMode === 'csv' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <UploadCloud size={20} color="var(--primary)" />
                            {t('import.csvImport')}
                        </h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button className="btn-secondary" onClick={() => { setImportMode('select'); setStep(1); setFile(null); setCsvData([]); }} style={{ padding: '6px 14px', fontSize: '0.8rem' }} title="Return to import method selection">← Back</button>
                            <div className="badge badge-gray" style={{ fontSize: '0.75rem' }}>Current Site: {currentPlant.label}</div>
                        </div>
                    </div>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
                    <AlertTriangle size={16} style={{ display: 'inline', marginRight: '5px' }} /> {error}
                </div>
            )}

            {step === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--glass-border)', padding: '40px', borderRadius: '12px', cursor: 'pointer', background: 'rgba(0,0,0,0.1)' }}>
                        <UploadCloud size={48} color="var(--text-muted)" style={{ marginBottom: '15px' }} />
                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{t('import.clickToUploadCsv')}</span>
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} title={t('importWizard.selectACsvFileToTip')} />
                    </label>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '0.9rem' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary)' }}>{t('import.capabilities')}</h4>
                        <ul style={{ paddingLeft: '20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <li>{t('import.importLargeAssetLists')}</li>
                            <li><strong>{t('import.sqlaccessSupport')}</strong> {t('import.exportYourLegacyDatabase')} <strong>{t('importWizard.csv')}</strong> {t('importWizard.firstThenMapThemHere')}</li>
                            <li>{t('import.alignsLegacyHeadersTo')}</li>
                        </ul>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '25px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary)' }}>1. Data Alignment Mapping</h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{t('import.matchYourLegacyColumns')}</p>
                            {Object.keys(targetFields).map(key => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ flex: 1.2, textAlign: 'right', fontWeight: 400, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{targetFields[key]}</div>
                                    <ArrowRight size={14} color="var(--primary)" />
                                    <div style={{ flex: 1.5 }}>
                                        <select
                                            value={mapping[key] || ''}
                                            onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '4px', background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--glass-border)', fontSize: '0.85rem' }}
                                            title={`Map a CSV column to ${targetFields[key]}`}
                                        >
                                            <option value="">{t('importWizard.ignoreField')}</option>
                                            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                <h4 style={{ margin: '0 0 10px 0', color: '#10b981' }}>2. Plant Isolation Safety</h4>
                                <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                                    Because this system uses **Isolated Site Nodes**, this import only affects <strong>{currentPlant.label}</strong>. 
                                    <br/><br/>
                                    It is physically impossible for this data to "break" other sites or the corporate Core.
                                </p>
                            </div>
                            <div style={{ display: 'flex', flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end', gap: '10px' }}>
                                <button className="btn-nav" onClick={() => setStep(1)} disabled={isUploading} title={t('importWizard.cancelAndReturnToFileTip')}>{t('import.cancel')}</button>
                                <button className="btn-primary btn-sm" onClick={() => setStep(3)} title={t('importWizard.previewTheMappedDataBeforeTip')}>
                                    Preview Import →
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                        <h4 style={{ margin: '0 0 15px 0', color: 'var(--primary)' }}>3. Final Review & Execution</h4>
                        <p style={{ fontSize: '0.9rem', marginBottom: '15px' }}>{t('import.belowIsHowThe')}</p>
                        
                        <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr>
                                        {Object.keys(targetFields).map(f => (
                                            <th key={f} style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid var(--glass-border)', color: 'var(--primary)' }}>{f}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvData.slice(0, 3).map((row, idx) => (
                                        <tr key={idx}>
                                            {Object.keys(targetFields).map(f => (
                                                <td key={f} style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    {row[mapping[f]] || <span style={{ opacity: 0.3 }}>--</span>}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#f87171', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '1rem' }}>
                                <AlertTriangle size={18} /> {t('import.confirmDataInjection')}
                            </h4>
                            <p style={{ fontSize: '0.85rem', marginBottom: '10px' }}>{t('import.injecting')} <strong>{csvData.length} records</strong>{t('importWizard.thisCannotBeUndoneThrough')}</p>
                            <input
                                type="text"
                                placeholder={`Type "${currentPlant.label}" to confirm`}
                                value={confirmPlant}
                                onChange={e => setConfirmPlant(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-main)', color: '#fff' }}
                                title={`Type the plant name to confirm import into ${currentPlant.label}`}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button className="btn-nav" onClick={() => setStep(2)} disabled={isUploading} title={t('importWizard.returnToColumnMappingTip')}>{t('import.backToMapping')}</button>
                        <button className="btn-danger" onClick={handleImport} disabled={isUploading || confirmPlant !== currentPlant.label} title={t('importWizard.executeTheDataImportThisTip')}>
                            {isUploading ? 'Creating Safety Snapshot...' : 'Final Commit & Inject'}
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                    <CheckCircle size={64} color="#10b981" style={{ margin: '0 auto 15px auto' }} />
                    <h2 style={{ marginBottom: '10px' }}>{t('import.importSuccessful')}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Successfully imported {csvData.length} new records into {currentPlant.label}.</p>
                    <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => { setStep(1); setCsvData([]); setFile(null); if (onComplete) onComplete(); }} title={t('importWizard.startANewImportTip')}>
                        {t('import.importAnotherFile')}
                    </button>
                </div>
            )}

            {/* Close CSV mode wrapper */}
            </div>
            )}

        </div>
    );
}
