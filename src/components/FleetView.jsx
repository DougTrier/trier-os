// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Fleet & Truck Shop Management View
 * ================================================
 * Full lifecycle vehicle management UI for the enterprise fleet.
 * Connects to /api/fleet endpoints in server/routes/fleet.js.
 *
 * TABS:
 *   Vehicles        — Fleet registry with GVWR, DOT number, odometer, and PM schedule
 *   Mileage Log     — Trip and odometer entries (anti-rollback guard enforced)
 *   Service History — PM and repair records; records advance NextPM automatically
 *   Fuel Log        — Fuel-up entries with auto-calculated MPG from odometer delta
 *   DVIR            — Driver Vehicle Inspection Reports (type-specific checklists)
 *   DOT Compliance  — License, medical cert, and HOS compliance status per driver
 *   Violations      — Traffic citations and DOT violations log
 *   Accidents       — Accident/incident reports with insurance and photos
 *   Expenses        — Cost tracking: fuel, repairs, insurance, registration
 *   Assignments     — Vehicle-to-driver and vehicle-to-plant assignments
 *
 * PRINT: Vehicle inspection reports and fleet cost summaries via PrintEngine.
 * SEARCH: SearchBar filters across vehicle number, make, model, and VIN.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Truck, Plus, Search, Eye, X, Fuel, ClipboardCheck, CircleDot, CreditCard, ShieldCheck, Pencil, Printer, Paperclip, Camera, Upload, QrCode, Info } from 'lucide-react';
import SearchBar from './SearchBar';
import ActionBar from './ActionBar';
import { statusClass, formatDate } from '../utils/formatDate';
import { TakeTourButton } from './ContextualTour';
import { useTranslation } from '../i18n/index.jsx';
import { BrowserMultiFormatReader, DecodeHintType } from '@zxing/library';

const InlineScanner = ({ onScan, onClose }) => {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let codeReader = null;
        let stream = null;

        const startScanner = async () => {
            try {
                codeReader = new BrowserMultiFormatReader();
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', true);
                    await videoRef.current.play();
                    codeReader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
                        if (result) {
                            onScan(result.getText());
                        }
                    });
                }
            } catch (err) {
                setError('Camera access denied or device not found.');
            }
        };

        startScanner();

        return () => {
            if (codeReader) codeReader.reset();
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [onScan]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 999999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            {error && <div style={{ color: '#ef4444', marginBottom: 20 }}>{error}</div>}
            <div style={{ position: 'relative', width: '90%', maxWidth: 400 }}>
                <video ref={videoRef} style={{ width: '100%', borderRadius: 12, border: '3px solid #f59e0b', background: '#000' }} />
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '2px solid rgba(245, 158, 11, 0.5)', zIndex: 10 }}></div>
            </div>
            <div style={{ color: '#fff', marginTop: 24, fontSize: '1.2rem', fontWeight: 600 }}>Scanning Vehicle QR...</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8, fontSize: '0.9rem' }}>Align the sticker inside the frame</div>
            <button onClick={onClose} style={{ marginTop: 40, padding: '10px 30px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 24, fontSize: '1rem', cursor: 'pointer' }}>Cancel Scan</button>
        </div>
    );
};


const API = (path, opts = {}) => fetch(`/api/fleet${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1', ...opts.headers },
});

const Badge = ({ color, children }) => (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:12, fontSize:'0.72rem', fontWeight:600, background:`${color}22`, color, border:`1px solid ${color}44` }}>{children}</span>
);

const FF = ({ t, label, type='text', value, onChange, options, required, disabled }) => {
    return (
        <div>
            <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>{label}{required && ' *'}</label>
            {options ? (
                <select disabled={disabled} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}>
                    <option value="">— {t ? t('common.select', 'Select') : 'Select'} —</option>
                    {options.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input disabled={disabled} type={type} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }} />
            )}
        </div>
    );
};

const Modal = ({ title, icon:Icon, color, onClose, width=600, children }) => (
    <div className="modal-overlay" onClick={onClose}>
        <div className="glass-card" onClick={e=>e.stopPropagation()} style={{ width, maxHeight:'85vh', overflow:'auto', padding:30 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h2 style={{ margin:0, color, display:'flex', alignItems:'center', gap:10 }}>{Icon&&<Icon size={20}/>} {title}</h2>
                <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }} title="Close"><X size={24}/></button>
            </div>
            {children}
        </div>
    </div>
);

const ModalActions = ({ t, onCancel, onSave, saveLabel }) => (
    <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
        <button className="btn-nav" onClick={onCancel} title={t ? t('common.cancel', 'Cancel') : 'Cancel'}>{t ? t('common.cancel', 'Cancel') : 'Cancel'}</button>
        <button className="btn-save" onClick={onSave} title={saveLabel || (t ? t('common.save', 'Save') : 'Save')}>{saveLabel || (t ? t('common.save', 'Save') : 'Save')}</button>
    </div>
);

const InfoRow = ({ label, value }) => (
    <div className="panel-box" style={{ padding:'10px 14px' }}>
        <strong style={{ fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase' }}>{label}</strong>
        <div style={{ fontSize:'0.95rem', marginTop:3 }}>{value || '—'}</div>
    </div>
);

const ActionBtn = ({ icon:Icon, tip, color='var(--text-muted)', onClick }) => (
    <button title={tip} onClick={e=>{e.stopPropagation();onClick&&onClick();}} style={{ background:'none', border:'none', cursor:'pointer', color, padding:'4px 6px', borderRadius:6, transition:'all 0.15s' }}
        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
        onMouseLeave={e=>e.currentTarget.style.background='none'}>
        <Icon size={17}/>
    </button>
);

const VehicleSelect = ({ value, onChange, vehicles, disabled }) => {
    const { t } = useTranslation();
    return (
        <div>
            <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>{t('fleet.vehicle')}</label>
            <select disabled={disabled} value={value||''} onChange={e=>onChange(e.target.value)} style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--glass-border)', borderRadius:8, padding:'8px 12px', color:'white', fontSize:'0.85rem' }}>
                <option value="">— {t('fleet.selectVehicle')} —</option>
                {vehicles.map(v=><option key={v.ID} value={v.ID}>{v.UnitNumber} — {v.Year} {v.Make} {v.Model}</option>)}
            </select>
        </div>
    );
};

const VTYPES = ['Tractor','Trailer','Straight Truck','Van','Pickup','Refrigerated Truck','Tanker','Flatbed','Box Truck','Forklift','Other'];
const FTYPES = ['Diesel','Gasoline','CNG','Electric','Hybrid','Propane'];

export default function FleetView({ plantId }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('vehicles');
    const [search, setSearch] = useState('');
    const [vehicles, setVehicles] = useState([]);
    const tabDataRef = React.useRef([]);
    useEffect(() => { API('/vehicles').then(r=>r.json()).then(setVehicles).catch(e => console.warn('[FleetView] fetch error:', e)); }, []);

    const onTabData = useCallback((items) => { tabDataRef.current = items; }, []);

    const tabs = [
        { id:'vehicles', label:t('fleet.tab.vehicles'), icon:Truck, tip:t('fleet.tip.vehicles') },
        { id:'dvir', label:t('fleet.tab.dvir'), icon:ClipboardCheck, tip:t('fleet.tip.dvir') },
        { id:'fuel', label:t('fleet.tab.fuel'), icon:Fuel, tip:t('fleet.tip.fuel') },
        { id:'tires', label:t('fleet.tab.tires', 'Tires'), icon:CircleDot, tip:t('fleet.tip.tires', 'Tire inventory and tracking') },
        { id:'licenses', label:t('fleet.tab.licenses', 'CDL / Licenses'), icon:CreditCard, tip:t('fleet.tip.licenses', 'CDL and license tracking') },
        { id:'dot', label:t('fleet.tab.dot', 'DOT Inspections'), icon:ShieldCheck, tip:t('fleet.tip.dot', 'Federal DOT inspection records') },
    ];

    return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'var(--spacing-base)' }}>
            <div className="glass-card no-print" style={{ padding:'15px 25px', display:'flex', gap:20, alignItems:'center', flexShrink:0 }}>
                <h2 style={{ fontSize:'1.4rem', margin:0, color:'#ea580c', display:'flex', alignItems:'center', gap:10 }}><Truck size={24}/> {t('fleet.fleetTruckShop', 'Fleet & Truck Shop')}</h2>
                <div style={{ width:2, height:30, background:'var(--glass-border)' }}/>
                <div className="nav-pills no-print" style={{ display:'flex', gap:6, flexWrap:'nowrap' }}>
                    {tabs.map(tabItem=>(
                        <button key={tabItem.id} onClick={()=>setTab(tabItem.id)} title={tabItem.tip} className={`btn-nav ${tab===tabItem.id?'active':''}`}
                            style={{ whiteSpace:'nowrap', height:36, display:'flex', alignItems:'center', gap:4, padding:'0 14px', fontSize:'0.82rem' }}>
                            <tabItem.icon size={15}/>{tabItem.label}
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
                    <button title={t('fleet.printCurrentViewWithCompanyTip', 'Print current view with company header')} className="btn-nav" onClick={()=>{
                        window.triggerTrierPrint('catalog-internal', { type: 'fleet-' + tab, items: tabDataRef.current || [] });
                    }} style={{ display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', height:36 }}><Printer size={15}/> {t('common.print')}</button>
                    <SearchBar value={search} onChange={setSearch} placeholder={t('fleet.searchFleetPlaceholder', 'Search fleet...')} width={220} title={t('fleet.searchByUnitNumberDriverTip', 'Search by unit number, driver, make, model, or VIN')} />
                    <TakeTourButton tourId="fleet" nestedTab={tab} />
                </div>
            </div>
            <div style={{ flex:1, display:'flex' }}>
                {tab==='vehicles' && <VehiclesTab plantId={plantId} search={search} vehicles={vehicles} setVehicles={setVehicles} onTabData={onTabData}/>}
                {tab==='dvir' && <DVIRTab search={search} vehicles={vehicles} onTabData={onTabData}/>}
                {tab==='fuel' && <FuelTab search={search} vehicles={vehicles} onTabData={onTabData}/>}
                {tab==='tires' && <TiresTab search={search} vehicles={vehicles} onTabData={onTabData}/>}
                {tab==='licenses' && <LicensesTab search={search} onTabData={onTabData}/>}
                {tab==='dot' && <DOTTab search={search} vehicles={vehicles} onTabData={onTabData}/>}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════ VEHICLES ═══════════════════════════════════════════════════ */
function VehiclesTab({ plantId, search, vehicles, setVehicles, onTabData }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [editVehicle, setEditVehicle] = useState(null);
    const [form, setForm] = useState({});
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));

    const fetch_ = useCallback(()=>{setLoading(true);API('/vehicles').then(r=>r.json()).then(d=>{setVehicles(d);setLoading(false);}).catch(()=>setLoading(false));},[setVehicles]);
    useEffect(()=>{fetch_();},[fetch_]);

    const filtered = useMemo(()=>{
        if(!search) return vehicles;
        const s=search.toLowerCase();
        return vehicles.filter(v=>[v.UnitNumber,v.Make,v.Model,v.VIN,v.AssignedDriver].some(x=>(x||'').toLowerCase().includes(s)));
    },[vehicles,search]);
    useEffect(()=>{ onTabData && onTabData(filtered); },[filtered, onTabData]);

    const loadDetail = async id=>{const r=await API(`/vehicles/${id}`);setDetail(await r.json());};
    const handleAdd = async()=>{const r=await API('/vehicles',{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({});fetch_();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const handleEdit = async()=>{const r=await API(`/vehicles/${editVehicle.ID}`,{method:'PUT',body:JSON.stringify(form)});if(r.ok){setEditVehicle(null);setForm({});fetch_();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const startEdit = v=>{setForm({UnitNumber:v.UnitNumber,VIN:v.VIN,Year:v.Year,Make:v.Make,Model:v.Model,VehicleType:v.VehicleType,Status:v.Status,LicensePlate:v.LicensePlate,PlateState:v.PlateState,FuelType:v.FuelType,AssignedDriver:v.AssignedDriver,Odometer:v.Odometer,PMIntervalMiles:v.PMIntervalMiles});setEditVehicle(v);};

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingFleet', 'Loading fleet...')}</div>;

    const VehicleForm = ({isEdit})=>(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
            <FF t={t} label={t('fleet.unit', 'Unit Number')} value={form.unitNumber||form.UnitNumber} onChange={v=>f(isEdit?'UnitNumber':'unitNumber',v)} required/>
            <FF t={t} label={t('fleet.vin', 'VIN')} value={form.vin||form.VIN} onChange={v=>f(isEdit?'VIN':'vin',v)}/>
            <FF t={t} label={t('fleet.vehicleType', 'Vehicle Type')} value={form.vehicleType||form.VehicleType} onChange={v=>f(isEdit?'VehicleType':'vehicleType',v)} options={VTYPES}/>
            <FF t={t} label={t('fleet.year', 'Year')} type="number" value={form.year||form.Year} onChange={v=>f(isEdit?'Year':'year',v)}/>
            <FF t={t} label={t('fleet.make', 'Make')} value={form.make||form.Make} onChange={v=>f(isEdit?'Make':'make',v)}/>
            <FF t={t} label={t('fleet.model', 'Model')} value={form.model||form.Model} onChange={v=>f(isEdit?'Model':'model',v)}/>
            <FF t={t} label={t('fleet.licensePlate', 'License Plate')} value={form.licensePlate||form.LicensePlate} onChange={v=>f(isEdit?'LicensePlate':'licensePlate',v)}/>
            <FF t={t} label={t('fleet.plateState', 'Plate State')} value={form.plateState||form.PlateState} onChange={v=>f(isEdit?'PlateState':'plateState',v)}/>
            <FF t={t} label={t('fleet.fuelType', 'Fuel Type')} value={form.fuelType||form.FuelType} onChange={v=>f(isEdit?'FuelType':'fuelType',v)} options={FTYPES}/>
            <FF t={t} label={t('fleet.assignedDriver', 'Assigned Driver')} value={form.assignedDriver||form.AssignedDriver} onChange={v=>f(isEdit?'AssignedDriver':'assignedDriver',v)}/>
            {isEdit && <FF t={t} label={t('fleet.status', 'Status')} value={form.Status} onChange={v=>f('Status',v)} options={['Active','In Shop','Out of Service','Retired','Sold']}/>}
            <FF t={t} label={t('fleet.odometer', 'Odometer')} type="number" value={form.odometer||form.Odometer} onChange={v=>f(isEdit?'Odometer':'odometer',v)}/>
        </div>
    );

    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><Truck size={24} color="#ea580c"/> {t('fleet.tab.vehicles')} ({filtered.length})</h2>
                <button title={t('fleet.addNewVehicleTip', 'Add a new vehicle to the fleet')} className="btn-save" onClick={()=>{setForm({});setShowInfo(false);setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.addVehicle', 'Add Vehicle')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('fleet.unit', 'Unit #')}</th><th>{t('fleet.year', 'Year')}</th><th>{t('fleet.makeModel', 'Make / Model')}</th><th>{t('fleet.type', 'Type')}</th><th>{t('fleet.vin', 'VIN')}</th><th>{t('fleet.status', 'Status')}</th><th>{t('fleet.odometer', 'Odometer')}</th><th>{t('fleet.pmDue', 'PM Due')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(v=>(
                    <tr key={v.ID}>
                        <td style={{fontWeight:600,color:'#ea580c'}}>{v.UnitNumber}</td><td>{v.Year}</td><td>{v.Make} {v.Model}</td><td>{v.VehicleType}</td>
                        <td style={{fontSize:'0.75rem',fontFamily:'monospace'}}>{v.VIN||'—'}</td>
                        <td><span className={statusClass(v.Status)}>{t('status.' + (v.Status || '').replace(/\s+/g, '').toLowerCase(), v.Status)}</span></td>
                        <td>{v.Odometer?v.Odometer.toLocaleString():'—'}</td>
                        <td>{v.NextPMDate?<span style={{color:new Date(v.NextPMDate)<=new Date()?'#ef4444':'#10b981',fontWeight:600,fontSize:'0.8rem'}}>{new Date(v.NextPMDate)<=new Date()?'⚠️ OVERDUE':v.NextPMDate}</span>:'—'}</td>
                        <td style={{display:'flex',gap:2}}>
                            <ActionBtn icon={Eye} tip={t('fleet.viewVehicleDetailsTip', 'View vehicle details, service history, and fuel log')} color="#3b82f6" onClick={()=>loadDetail(v.ID)}/>
                            <ActionBtn icon={Pencil} tip={t('fleet.editVehicleInformationTip', 'Edit vehicle information')} color="#f59e0b" onClick={()=>{setShowInfo(false);startEdit(v);}}/>
                        </td>
                    </tr>
                ))}{filtered.length===0&&<tr><td colSpan={9} className="table-empty">{t('common.noRecordsFound')}</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title="Add Vehicle" icon={Plus} color="#ea580c" onClose={()=>setShowAdd(false)}>
                <VehicleForm/>
                {showInfo && (
                    <div style={{ marginTop: 20, padding: '12px 15px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10, color: '#38bdf8' }}>
                        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Print this QR code while adding the vehicle. Stick it in the cab so drivers can easily pull up the exact DVIR and Refuel logs!
                        </div>
                        <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 2 }} title="Close">
                            <X size={16} />
                        </button>
                    </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e) => { 
                            e.preventDefault(); 
                            const vNum = form.unitNumber || form.UnitNumber;
                            if (!vNum) return window.trierToast?.warn('Please type a Unit # first to print its QR code.');
                            window.triggerTrierPrint('qr-sticker', { unit: vNum }); 
                        }} title="Create QR code for truck" style={{display:'flex', alignItems:'center', gap:6}}><QrCode size={16}/> Print QR</button>
                        <button className="btn-nav" onClick={(e) => { e.preventDefault(); setShowInfo(!showInfo); }} title="Info" style={{display:'flex', alignItems:'center', gap:6, padding:'0 8px'}}><Info size={16}/></button>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e)=>{e.preventDefault(); setShowAdd(false);}}>{t('common.cancel', 'Cancel')}</button>
                        <button className="btn-save" onClick={(e)=>{e.preventDefault(); handleAdd();}}>Save Vehicle</button>
                    </div>
                </div>
            </Modal>
        )}
        
        {editVehicle && (
            <Modal title={`Edit ${editVehicle.UnitNumber}`} icon={Pencil} color="#f59e0b" onClose={()=>setEditVehicle(null)}>
                <VehicleForm isEdit/>
                {showInfo && (
                    <div style={{ marginTop: 20, padding: '12px 15px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10, color: '#38bdf8' }}>
                        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Print a replacement QR code if the original was damaged or missing from the cab.
                        </div>
                        <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 2 }} title="Close">
                            <X size={16} />
                        </button>
                    </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e) => { 
                            e.preventDefault(); 
                            const vNum = form.unitNumber || form.UnitNumber;
                            if (!vNum) return window.trierToast?.warn('Please type a Unit # first to print its QR code.');
                            window.triggerTrierPrint('qr-sticker', { unit: vNum }); 
                        }} title="Create QR code for truck" style={{display:'flex', alignItems:'center', gap:6}}><QrCode size={16}/> Print QR</button>
                        <button className="btn-nav" onClick={(e) => { e.preventDefault(); setShowInfo(!showInfo); }} title="Info" style={{display:'flex', alignItems:'center', gap:6, padding:'0 8px'}}><Info size={16}/></button>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e)=>{e.preventDefault(); setEditVehicle(null);}}>{t('common.cancel', 'Cancel')}</button>
                        <button className="btn-save" onClick={(e)=>{e.preventDefault(); handleEdit();}}>Update Vehicle</button>
                    </div>
                </div>
            </Modal>
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>setDetail(null)}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()}>
                    <ActionBar
                        title={`${detail.vehicle?.UnitNumber} — ${detail.vehicle?.Year} ${detail.vehicle?.Make} ${detail.vehicle?.Model}`}
                        icon={<Truck size={20} />}
                        isEditing={false}
                        isCreating={false}
                        onPrint={() => window.triggerTrierPrint('fleet-vehicle', { ...detail, plantLabel: localStorage.getItem('selectedPlantId') })}
                        onClose={() => setDetail(null)}
                        showEdit={false}
                        showDelete={false}
                    />
                    <div style={{flex:1,padding:20,overflowY:'auto'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                            <InfoRow label={t('fleet.vin', 'VIN')} value={detail.vehicle?.VIN}/><InfoRow label={t('common.type', 'Type')} value={detail.vehicle?.VehicleType}/><InfoRow label={t('common.status', 'Status')} value={detail.vehicle?.Status}/>
                            <InfoRow label="Plate" value={detail.vehicle?.LicensePlate}/><InfoRow label="Odometer" value={detail.vehicle?.Odometer?.toLocaleString()}/><InfoRow label="Fuel" value={detail.vehicle?.FuelType}/>
                            <InfoRow label="Driver" value={detail.vehicle?.AssignedDriver}/><InfoRow label="Next PM" value={detail.vehicle?.NextPMDate}/><InfoRow label="Engine Hours" value={detail.vehicle?.EngineHours?.toLocaleString()}/>
                        </div>
                        {detail.serviceHistory?.length>0&&<div className="panel-box" style={{marginBottom:15}}><h3>Service History ({detail.serviceHistory.length})</h3><table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>Type</th><th>Description</th><th>Cost</th><th>{t('common.by', 'By')}</th></tr></thead><tbody>{detail.serviceHistory.slice(0,15).map((s,i)=><tr key={`item-${i}`}><td>{formatDate(s.ServiceDate)}</td><td><Badge color="#3b82f6">{s.ServiceType}</Badge></td><td>{s.Description}</td><td>{s.TotalCost?`$${s.TotalCost.toFixed(2)}`:'—'}</td><td>{s.PerformedBy||'—'}</td></tr>)}</tbody></table></div>}
                        {detail.fuelLog?.length>0&&<div className="panel-box"><h3>Recent Fuel ({detail.fuelLog.length})</h3><table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>Gal</th><th>Cost</th><th>Odometer</th><th>MPG</th></tr></thead><tbody>{detail.fuelLog.slice(0,10).map((fl,i)=><tr key={`item-${i}`}><td>{formatDate(fl.FillDate)}</td><td>{fl.Gallons}</td><td>{fl.TotalCost?`$${fl.TotalCost.toFixed(2)}`:'—'}</td><td>{fl.OdometerAtFill?.toLocaleString()||'—'}</td><td>{fl.MPG||'—'}</td></tr>)}</tbody></table></div>}
                    </div>
                </div>
            </div>
        )}
    </>);
}

function DVIRTab({ search, vehicles, onTabData }) {
    const { t } = useTranslation();
    const getDefaultDriver = () => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}').fullName || localStorage.getItem('currentUser') || ''; } catch { return localStorage.getItem('currentUser') || ''; } };
    const [dvirs, setDvirs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [editItems, setEditItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ inspectionType:'Pre-Trip', driver: getDefaultDriver() });
    const [attachments, setAttachments] = useState([]);
    const [showInfo, setShowInfo] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetchDvirs = useCallback(()=>{setLoading(true);API('/dvir').then(r=>r.ok?r.json():[]).then(d=>{setDvirs(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>{setDvirs([]);setLoading(false);});},[]);
    useEffect(()=>{fetchDvirs();},[fetchDvirs]);

    const filtered = useMemo(()=>{if(!search) return dvirs;const s=search.toLowerCase();return dvirs.filter(d=>[d.Driver,d.UnitNumber].some(x=>(x||'').toLowerCase().includes(s)));},[dvirs,search]);
    useEffect(()=>{ onTabData && onTabData(filtered); },[filtered, onTabData]);

    const loadDetail = async id=>{const r=await API(`/dvir/${id}`);if(r.ok) { const data = await r.json(); setDetail(data); setEditing(false); setAttachments(data.dvir?.attachments || []); }};
    const handleAdd = async()=>{if(!form.vehicleId||!form.driver) return window.trierToast?.warn('Vehicle and Driver required');const r=await API('/dvir',{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({inspectionType:'Pre-Trip', driver: getDefaultDriver()});setShowInfo(false);fetchDvirs();}else{const d=await r.json();window.trierToast?.error(d.error);}};

    const startEdit = () => {
        if (!detail?.dvir) return;
        setEditForm({
            Driver: detail.dvir.Driver || '',
            InspectionType: detail.dvir.InspectionType || 'Pre-Trip',
            Status: detail.dvir.Status || 'Pass',
            OdometerAtInspection: detail.dvir.OdometerAtInspection || '',
            Notes: detail.dvir.Notes || '',
            ReviewedBy: detail.dvir.ReviewedBy || '',
        });
        setEditItems((detail.items || []).map(it => ({ ...it })));
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Save DVIR header
            const r = await API(`/dvir/${detail.dvir.ID}`, { method: 'PUT', body: JSON.stringify(editForm) });
            if (!r.ok) { const d = await r.json(); window.trierToast?.error(d.error); setSaving(false); return; }

            // Save changed checklist items
            for (const it of editItems) {
                const orig = detail.items.find(o => o.ID === it.ID);
                if (orig && (orig.Condition !== it.Condition || orig.DefectNotes !== it.DefectNotes)) {
                    await API(`/dvir/${detail.dvir.ID}/items/${it.ID}`, {
                        method: 'POST',
                        body: JSON.stringify({ condition: it.Condition, defectNotes: it.DefectNotes, severity: it.Condition === 'Defective' ? 'Needs Repair' : null })
                    });
                }
            }

            // Reload detail
            await loadDetail(detail.dvir.ID);
            fetchDvirs();
        } catch (err) {
            console.error('DVIR save error:', err);
            window.trierToast?.error('Failed to save changes');
        }
        setSaving(false);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if(file) {
            const newAtt = { id: Date.now(), name: file.name, url: URL.createObjectURL(file), type: file.type };
            setAttachments(prev => [...prev, newAtt]);
            window.trierToast?.success(t('fleet.fileAttached', 'File attached successfully'));
        }
    };

    const updateItem = (id, field, val) => {
        setEditItems(prev => prev.map(it => it.ID === id ? { ...it, [field]: val } : it));
    };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingDvirs', 'Loading DVIRs...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><ClipboardCheck size={24} color="#3b82f6"/> {t('fleet.tab.dvir')} ({filtered.length})</h2>
                <button title={t('fleet.newDvirInspectionTip', 'New DVIR Inspection')} className="btn-save" onClick={()=>{setForm({inspectionType:'Pre-Trip', driver: getDefaultDriver()}); setShowInfo(false); setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.newDvir', 'New DVIR')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>{t('fleet.vehicle', 'Vehicle')}</th><th>{t('fleet.driver', 'Driver')}</th><th>{t('common.type', 'Type')}</th><th>{t('fleet.result', 'Result')}</th><th>{t('fleet.defects', 'Defects')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(d=>(
                    <tr key={d.ID}>
                        <td>{formatDate(d.InspectionDate)}</td><td style={{fontWeight:600}}>{d.UnitNumber||`#${d.VehicleID}`}</td><td>{d.Driver}</td>
                        <td><Badge color="#6366f1">{d.InspectionType}</Badge></td>
                        <td>{d.Status==='Pass'?<span className={statusClass('Completed')}>✓ Pass</span>:<span className={statusClass('Overdue')}>✗ {d.Status}</span>}</td>
                        <td>{d.DefectsFound||0}</td>
                        <td style={{display:'flex',gap:2}}>
                            <ActionBtn icon={Eye} tip={t('fleet.viewDvirChecklistTip', 'View full DVIR checklist and defect details')} color="#3b82f6" onClick={()=>loadDetail(d.ID)}/>
                            <ActionBtn icon={Pencil} tip={t('common.edit')} color="#f59e0b" onClick={()=>{loadDetail(d.ID).then(()=>setTimeout(()=>startEdit(),300));}}/>
                        </td>
                    </tr>
                ))}{filtered.length===0&&<tr><td colSpan={7} className="table-empty">{t('fleet.noDvirsRecorded', 'No DVIRs recorded.')}</td></tr>}</tbody></table>
            </div>
        </div>

        {showAdd && (
            <Modal title="New DVIR Inspection" icon={ClipboardCheck} color="#3b82f6" onClose={()=>setShowAdd(false)} width={500}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <div style={{gridColumn:'span 2'}}><VehicleSelect value={form.vehicleId} onChange={v=>f('vehicleId',v)} vehicles={vehicles}/></div>
                    <FF t={t} label="Driver Name" value={form.driver} onChange={v=>f('driver',v)} required/>
                    <FF t={t} label="Inspection Type" value={form.inspectionType} onChange={v=>f('inspectionType',v)} options={['Pre-Trip','Post-Trip','Annual','Random']}/>
                    <FF t={t} label="Odometer" type="number" value={form.odometerAtInspection} onChange={v=>f('odometerAtInspection',v)}/>
                    <FF t={t} label={t('common.notes', 'Notes')} value={form.notes} onChange={v=>f('notes',v)}/>
                </div>
                {showInfo && (
                    <div style={{ marginTop: 20, padding: '12px 15px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 10, color: '#38bdf8' }}>
                        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Stick the QR Code in the cab. Next time, just scan it to instantly open a new DVIR for this truck without navigating menus!
                        </div>
                        <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 2 }} title="Close">
                            <X size={16} />
                        </button>
                    </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e) => { 
                            e.preventDefault(); 
                            if (!form.vehicleId) {
                                return window.trierToast?.warn('Please select a vehicle from the dropdown first to print its QR code.');
                            }
                            window.triggerTrierPrint('qr-sticker', { unit: vehicles.find(v=>String(v.ID)===String(form.vehicleId))?.UnitNumber || 'Vehicle' }); 
                        }} title="Create QR code for truck" style={{display:'flex', alignItems:'center', gap:6}}><QrCode size={16}/> Print QR</button>
                        <button className="btn-nav" onClick={(e) => { e.preventDefault(); setShowInfo(!showInfo); }} title="Info" style={{display:'flex', alignItems:'center', gap:6, padding:'0 8px'}}><Info size={16}/></button>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e)=>{e.preventDefault(); setShowAdd(false);}}>{t('common.cancel', 'Cancel')}</button>
                        <button className="btn-save" onClick={(e)=>{e.preventDefault(); handleAdd();}}>Create DVIR</button>
                    </div>
                </div>
            </Modal>
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()}>
                    <ActionBar
                        title={`DVIR #${detail.dvir?.ID} — ${detail.dvir?.UnitNumber||''}`}
                        icon={<ClipboardCheck size={20} />}
                        isEditing={editing}
                        isCreating={false}
                        onEdit={startEdit}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('fleet-dvir', detail)}
                        onClose={() => {setDetail(null);setEditing(false);}}
                        onCancel={() => setEditing(false)}
                        isSaving={saving}
                        showDelete={false}
                    />
                    <div className="scroll-area" style={{padding:20,overflowY:'auto',flex:1}}>
                        {!editing ? (
                            <>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:20}}>
                                    <InfoRow label={t('common.date', 'Date')} value={formatDate(detail.dvir?.InspectionDate)}/><InfoRow label="Driver" value={detail.dvir?.Driver}/><InfoRow label={t('common.type', 'Type')} value={detail.dvir?.InspectionType}/>
                                    <InfoRow label="Vehicle" value={`${detail.dvir?.UnitNumber} ${detail.dvir?.Year||''} ${detail.dvir?.Make||''} ${detail.dvir?.Model||''}`}/><InfoRow label="Odometer" value={detail.dvir?.OdometerAtInspection?.toLocaleString()}/><InfoRow label="Result" value={detail.dvir?.Status}/>
                                    {detail.dvir?.Notes && <div style={{gridColumn:'span 3'}}><InfoRow label={t('common.notes', 'Notes')} value={detail.dvir.Notes}/></div>}
                                    {detail.dvir?.ReviewedBy && <InfoRow label="Reviewed By" value={detail.dvir.ReviewedBy}/>}
                                    {detail.dvir?.ReviewedAt && <InfoRow label="Reviewed At" value={formatDate(detail.dvir.ReviewedAt)}/>}
                                </div>
                            </>
                        ) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:15,marginBottom:20}}>
                                <FF t={t} label="Driver" value={editForm.Driver} onChange={v=>ef('Driver',v)} required/>
                                <FF t={t} label="Inspection Type" value={editForm.InspectionType} onChange={v=>ef('InspectionType',v)} options={['Pre-Trip','Post-Trip','Annual','Random']}/>
                                <FF t={t} label={t('common.status', 'Status')} value={editForm.Status} onChange={v=>ef('Status',v)} options={['Pass','Defects Found','Out of Service']}/>
                                <FF t={t} label="Odometer" type="number" value={editForm.OdometerAtInspection} onChange={v=>ef('OdometerAtInspection',v)}/>
                                <FF t={t} label="Reviewed By" value={editForm.ReviewedBy} onChange={v=>ef('ReviewedBy',v)}/>
                                <FF t={t} label={t('common.notes', 'Notes')} value={editForm.Notes} onChange={v=>ef('Notes',v)}/>
                            </div>
                        )}

                        {/* Checklist Items */}
                        {(editing ? editItems : detail.items)?.length > 0 && (
                            <div>
                                <h3 style={{marginBottom:10}}>Checklist Items ({(editing ? editItems : detail.items).length})</h3>
                                <table className="data-table"><thead><tr><th>Category</th><th>Item</th><th>Condition</th><th>{editing ? 'Defect Notes' : 'Notes'}</th></tr></thead>
                                <tbody>{(editing ? editItems : detail.items).map(it=>(
                                    <tr key={it.ID} style={{background:it.Condition==='Defective'?'rgba(239,68,68,0.08)':'transparent'}}>
                                        <td style={{fontWeight:600,fontSize:'0.8rem'}}>{it.Category}</td>
                                        <td>{it.ItemDescription}</td>
                                        <td>
                                            {editing ? (
                                                <select value={it.Condition||'OK'} onChange={e=>updateItem(it.ID,'Condition',e.target.value)}
                                                    style={{background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:6,padding:'4px 8px',color:'white',fontSize:'0.82rem'}}>
                                                    <option value="OK">OK</option>
                                                    <option value="Defective">Defective</option>
                                                    <option value="Needs Attention">Needs Attention</option>
                                                </select>
                                            ) : (
                                                it.Condition==='OK'?<span className={statusClass('Completed')}>OK</span>:it.Condition==='Defective'?<span className={statusClass('Overdue')}>Defective</span>:<span className={statusClass('Hold')}>{it.Condition||'Pending'}</span>
                                            )}
                                        </td>
                                        <td>
                                            {editing ? (
                                                <input type="text" value={it.DefectNotes||''} onChange={e=>updateItem(it.ID,'DefectNotes',e.target.value)} placeholder="Enter notes..."
                                                    style={{width:'100%',background:'rgba(255,255,255,0.06)',border:'1px solid var(--glass-border)',borderRadius:6,padding:'4px 8px',color:'white',fontSize:'0.82rem'}}/>
                                            ) : (
                                                <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{it.DefectNotes||''}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}</tbody></table>
                            </div>
                        )}

                        {/* Attachments Section */}
                        <div style={{ marginTop: 25, paddingTop: 20, borderTop: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Paperclip size={18} /> Attachments</h3>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                                    <button className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }} onClick={() => cameraInputRef.current?.click()} title="Take Photo">
                                        <Camera size={15} /> Photo
                                    </button>
                                    <button className="btn-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }} onClick={() => fileInputRef.current?.click()} title="Upload File">
                                        <Upload size={15} /> Upload
                                    </button>
                                </div>
                            </div>
                            {attachments.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
                                    {attachments.map(att => (
                                        <div key={att.id} className="panel-box" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center' }}>
                                            {att.type?.startsWith('image') || att.url?.match(/\.(jpeg|jpg|gif|png)$/) ? (
                                                <img src={att.url} alt={att.name} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6 }} />
                                            ) : (
                                                <div style={{ width: '100%', height: 120, background: 'rgba(255,255,255,0.05)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Paperclip size={32} color="var(--text-muted)" />
                                                </div>
                                            )}
                                            <span style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{att.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="table-empty" style={{ padding: '30px 15px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                    No attachments yet. Take a picture of the printed checklist or upload a file.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════════════════════════ FUEL ═══════════════════════════════════════════════════ */
function FuelTab({ search, vehicles, onTabData }) {
    const { t } = useTranslation();
    const getDefaultDriver = () => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}').fullName || localStorage.getItem('currentUser') || ''; } catch { return localStorage.getItem('currentUser') || ''; } };
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({});
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetchLogs = useCallback(async ()=>{
        setLoading(true);
        try {
            const res = await API('/fuel');
            if(res.ok) {
                const d = await res.json();
                setLogs((Array.isArray(d)?d:[]).sort((a,b)=>(b.FillDate||'').localeCompare(a.FillDate||'')));
            } else {
                const chunks = [];
                const batchSize = 5;
                const vList = vehicles.slice(0, 25);
                for(let i=0; i<vList.length; i+=batchSize) {
                    const batch = vList.slice(i, i+batchSize);
                    const results = await Promise.all(batch.map(v=>API(`/vehicles/${v.ID}/fuel`).then(r=>r.ok?r.json():{}).then(d=>(d.logs||[]).map(l=>({...l,UnitNumber:v.UnitNumber,VehicleID:v.ID}))).catch(()=>[])));
                    chunks.push(...results.flat());
                }
                setLogs(chunks.sort((a,b)=>(b.FillDate||'').localeCompare(a.FillDate||'')));
            }
        } catch(e) { console.error(e); }
        setLoading(false);
    },[vehicles]);
    useEffect(()=>{if(vehicles.length>0)fetchLogs();else setLoading(false);},[vehicles,fetchLogs]);

    const filtered = useMemo(()=>{if(!search) return logs;const s=search.toLowerCase();return logs.filter(l=>[l.UnitNumber,l.Station].some(x=>(x||'').toLowerCase().includes(s)));},[logs,search]);
    useEffect(()=>{ onTabData && onTabData(filtered); },[filtered, onTabData]);

    const handleAdd = async()=>{if(!form.vehicleId||!form.gallons) return window.trierToast?.warn('Vehicle and Gallons required');const r=await API(`/vehicles/${form.vehicleId}/fuel`,{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({});fetchLogs();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const startEdit = (item) => { setEditForm({ Gallons:item.Gallons||'', CostPerGallon:item.CostPerGallon||'', OdometerAtFill:item.OdometerAtFill||'', Station:item.Station||'', FuelType:item.FuelType||'Diesel' }); setEditing(true); };
    const handleSave = async () => { const r=await API(`/fuel/${detail.ID}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);fetchLogs();setDetail({...detail,...editForm,TotalCost:(parseFloat(editForm.Gallons)||0)*(parseFloat(editForm.CostPerGallon)||0)});}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingFuelLogs', 'Loading fuel logs...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><Fuel size={24} color="#f59e0b"/> {t('fleet.tab.fuel')} ({filtered.length})</h2>
                <button title={t('fleet.logANewFuelFillupTip', 'Log a new fuel fill-up with gallons, cost, and odometer')} className="btn-save" onClick={()=>{setForm({ driver: getDefaultDriver() }); setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.logFuel', 'Log Fuel')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>{t('fleet.vehicle', 'Vehicle')}</th><th>{t('fleet.gallons', 'Gallons')}</th><th>{t('fleet.costPerGal', '$/Gal')}</th><th>{t('common.total', 'Total')}</th><th>{t('fleet.odometer', 'Odometer')}</th><th>{t('fleet.mpg', 'MPG')}</th><th>{t('fleet.station', 'Station')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(l=>(
                    <tr key={l.ID}><td>{formatDate(l.FillDate)}</td><td style={{fontWeight:600}}>{l.UnitNumber}</td><td>{l.Gallons?.toFixed(1)}</td>
                    <td>{l.CostPerGallon?`$${l.CostPerGallon.toFixed(3)}`:'—'}</td><td>{l.TotalCost?`$${l.TotalCost.toFixed(2)}`:'—'}</td>
                    <td>{l.OdometerAtFill?.toLocaleString()||'—'}</td>
                    <td style={{fontWeight:600,color:l.MPG&&l.MPG<5?'#ef4444':'#10b981'}}>{l.MPG?l.MPG.toFixed(1):'—'}</td><td>{l.Station||'—'}</td>
                    <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('fleet.viewFuelEntryTip', 'View fuel entry')} color="#3b82f6" onClick={()=>{setDetail(l);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('fleet.editFuelEntryTip', 'Edit fuel entry')} color="#f59e0b" onClick={()=>{setDetail(l);startEdit(l);}}/></td></tr>
                ))}{filtered.length===0&&<tr><td colSpan={9} className="table-empty">{t('fleet.noFuelEntriesYet', 'No fuel entries yet.')}</td></tr>}</tbody></table>
            </div>
        </div>
        {showAdd && (
            <Modal title="Log Fuel Fill" icon={Fuel} color="#f59e0b" onClose={()=>setShowAdd(false)} width={500}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <div style={{gridColumn:'span 2'}}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle *</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                                <VehicleSelect value={form.vehicleId} onChange={v=>f('vehicleId',v)} vehicles={vehicles}/>
                            </div>
                            <button 
                                title="Scan QR sticker to select vehicle" 
                                className="btn-nav"
                                onClick={(e) => { 
                                    e.preventDefault(); 
                                    setShowScanner(true);
                                }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(234, 88, 12, 0.1)', border: '1px solid rgba(234, 88, 12, 0.3)', color: '#ea580c', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}
                            >
                                <QrCode size={18} />
                            </button>
                        </div>
                    </div>
                    <FF t={t} label="Driver Name" value={form.driver || getDefaultDriver()} onChange={v=>f('driver',v)} required/>
                    <FF t={t} label="Fuel Type" value={form.fuelType} onChange={v=>f('fuelType',v)} options={FTYPES}/>
                    <FF t={t} label="Gallons" type="number" value={form.gallons} onChange={v=>f('gallons',v)} required/>
                    <FF t={t} label="Cost per Gallon ($)" type="number" value={form.costPerGallon} onChange={v=>f('costPerGallon',v)}/>
                    <FF t={t} label="Odometer at Fill" type="number" value={form.odometerAtFill} onChange={v=>f('odometerAtFill',v)}/>
                    <FF t={t} label="DEF Gallons" type="number" value={form.defGallons} onChange={v=>f('defGallons',v)}/>
                    <div style={{ gridColumn: 'span 2' }}>
                        <FF t={t} label="Station / Location" value={form.station} onChange={v=>f('station',v)}/>
                    </div>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:20, paddingTop:15, borderTop:'1px solid var(--glass-border)' }}>
                    <div style={{ display:'flex', gap:10 }}>
                        <button className="btn-nav" onClick={(e)=>{e.preventDefault(); setShowAdd(false);}}>{t('common.cancel', 'Cancel')}</button>
                        <button className="btn-save" onClick={(e)=>{e.preventDefault(); handleAdd();}}>Log Fuel</button>
                    </div>
                </div>
            </Modal>
        )}
        
        {showScanner && (
            <InlineScanner 
                onClose={() => setShowScanner(false)} 
                onScan={(val) => {
                    setShowScanner(false);
                    // Match barcode text (vNum) against unit number
                    const matchedVehicle = vehicles.find(v => String(v.UnitNumber).toLowerCase() === val.toLowerCase() || String(v.ID) === val);
                    if (matchedVehicle) {
                        f('vehicleId', matchedVehicle.ID);
                        window.trierToast?.success(`Scanned: ${matchedVehicle.UnitNumber}`);
                    } else {
                        window.trierToast?.error(`Unrecognized QR (Read: ${val}). Must be a valid Unit number.`);
                    }
                }} 
            />
        )}

        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
                    <ActionBar
                        title={`Fuel Entry — ${detail.UnitNumber}`}
                        icon={<Fuel size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('fleet-fuel-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                                <InfoRow label={t('common.date', 'Date')} value={formatDate(detail.FillDate)}/><InfoRow label="Vehicle" value={detail.UnitNumber}/><InfoRow label="Gallons" value={detail.Gallons?.toFixed(1)}/>
                                <InfoRow label="Cost/Gal" value={detail.CostPerGallon?`$${detail.CostPerGallon.toFixed(3)}`:null}/><InfoRow label="Total Cost" value={detail.TotalCost?`$${detail.TotalCost.toFixed(2)}`:null}/><InfoRow label="Odometer" value={detail.OdometerAtFill?.toLocaleString()}/>
                                <InfoRow label="MPG" value={detail.MPG?.toFixed(1)}/><InfoRow label="Station" value={detail.Station}/><InfoRow label="Fuel Type" value={detail.FuelType}/>
                            </div>
                        ) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <FF t={t} label="Gallons" type="number" value={editForm.Gallons} onChange={v=>ef('Gallons',v)}/>
                                <FF t={t} label="Cost/Gal ($)" type="number" value={editForm.CostPerGallon} onChange={v=>ef('CostPerGallon',v)}/>
                                <FF t={t} label="Odometer" type="number" value={editForm.OdometerAtFill} onChange={v=>ef('OdometerAtFill',v)}/>
                                <FF t={t} label="Station" value={editForm.Station} onChange={v=>ef('Station',v)}/>
                                <FF t={t} label="Fuel Type" value={editForm.FuelType} onChange={v=>ef('FuelType',v)} options={FTYPES}/>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════════════════════════ TIRES ═══════════════════════════════════════════════════ */
function TiresTab({ search, vehicles, onTabData }) {
    const { t } = useTranslation();
    const [tires, setTires] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({});
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetchTires = useCallback(async ()=>{
        setLoading(true);
        try {
            const res = await API('/tires');
            if(res.ok) {
                const d = await res.json();
                setTires(Array.isArray(d)?d:[]);
            } else {
                const chunks = [];
                const vList = vehicles.slice(0, 20);
                for(let i=0; i<vList.length; i+=5) {
                    const batch = vList.slice(i, i+5);
                    const results = await Promise.all(batch.map(v=>API(`/vehicles/${v.ID}/tires`).then(r=>r.ok?r.json():[]).then(d=>(Array.isArray(d)?d:[]).map(tr=>({...tr,UnitNumber:v.UnitNumber}))).catch(()=>[])));
                    chunks.push(...results.flat());
                }
                setTires(chunks);
            }
        } catch (e) { console.warn('[FleetView] caught:', e); }
        setLoading(false);
    },[vehicles]);
    useEffect(()=>{if(vehicles.length>0)fetchTires();else setLoading(false);},[vehicles,fetchTires]);
    useEffect(()=>{ onTabData && onTabData(tires); },[tires, onTabData]);

    const handleAdd = async()=>{if(!form.vehicleId||!form.position) return window.trierToast?.warn('Vehicle and Position required');const r=await API(`/vehicles/${form.vehicleId}/tires`,{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({});fetchTires();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const startEdit = (item) => { setEditForm({ TireSerial:item.TireSerial||'', Position:item.Position||'', Brand:item.Brand||'', Model:item.Model||'', Size:item.Size||'', TreadDepth:item.TreadDepth??'', Status:item.Status||'In Service' }); setEditing(true); };
    const handleSave = async () => { const r=await API(`/tires/${detail.ID}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);fetchTires();setDetail({...detail,...editForm});}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingTires', 'Loading tires...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><CircleDot size={24} color="#8b5cf6"/> {t('fleet.tab.tires')} ({tires.length})</h2>
                <button title={t('fleet.mountANewTireToTip', 'Mount a new tire to a vehicle position')} className="btn-save" onClick={()=>setShowAdd(true)} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.mountTire', 'Mount Tire')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('fleet.vehicle', 'Vehicle')}</th><th>{t('fleet.position', 'Position')}</th><th>{t('fleet.serial', 'Serial')}</th><th>{t('fleet.brandModel', 'Brand / Model')}</th><th>{t('fleet.size', 'Size')}</th><th>{t('fleet.treadDepth', 'Tread Depth')}</th><th>{t('fleet.installed', 'Installed')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{tires.map(tire=>(
                    <tr key={tire.ID}><td style={{fontWeight:600}}>{tire.UnitNumber}</td><td><Badge color="#6366f1">{tire.Position}</Badge></td>
                    <td style={{fontFamily:'monospace',fontSize:'0.75rem'}}>{tire.TireSerial||'—'}</td><td>{[tire.Brand,tire.Model].filter(Boolean).join(' ')||'—'}</td><td>{tire.Size||'—'}</td>
                    <td title={`Tread depth: ${tire.TreadDepth||'N/A'}/32" — ${tire.TreadDepth<4?'REPLACE SOON':tire.TreadDepth<6?'Monitor closely':'Good condition'}`} style={{fontWeight:600,color:tire.TreadDepth!=null&&tire.TreadDepth<4?'#ef4444':tire.TreadDepth<6?'#f59e0b':'#10b981'}}>{tire.TreadDepth!=null?`${tire.TreadDepth}/32"`:'—'}</td>
                    <td>{formatDate(tire.DateInstalled)||'—'}</td><td><span className={statusClass(tire.Status==='In Service'?'Active':tire.Status)}>{t('status.' + (tire.Status || '').replace(/\s+/g, '').toLowerCase(), tire.Status)}</span></td>
                    <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('fleet.viewTireDetailTip', 'View tire detail')} color="#3b82f6" onClick={()=>{setDetail(tire);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('common.edit')} color="#f59e0b" onClick={()=>{setDetail(tire);startEdit(tire);}}/></td></tr>
                ))}{tires.length===0&&<tr><td colSpan={9} className="table-empty">{t('fleet.noTiresTrackedYet', 'No tires tracked yet.')}</td></tr>}</tbody></table>
            </div>
        </div>
        {showAdd && (
            <Modal title="Mount Tire" icon={CircleDot} color="#8b5cf6" onClose={()=>setShowAdd(false)} width={500}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <div style={{gridColumn:'span 2'}}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle *</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                                <VehicleSelect value={form.vehicleId} onChange={v=>f('vehicleId',v)} vehicles={vehicles}/>
                            </div>
                            <button title="Scan QR sticker to select vehicle" className="btn-nav" onClick={(e) => { e.preventDefault(); setShowScanner(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(234, 88, 12, 0.1)', border: '1px solid rgba(234, 88, 12, 0.3)', color: '#ea580c', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>
                                <QrCode size={18} />
                            </button>
                        </div>
                    </div>
                    <FF t={t} label="Position" value={form.position} onChange={v=>f('position',v)} options={['LF (Left Front)','RF (Right Front)','LRO (Left Rear Outer)','LRI (Left Rear Inner)','RRO (Right Rear Outer)','RRI (Right Rear Inner)','Spare']} required/>
                    <FF t={t} label="Tire Serial" value={form.tireSerial} onChange={v=>f('tireSerial',v)}/>
                    <FF t={t} label="Brand" value={form.brand} onChange={v=>f('brand',v)}/><FF t={t} label={t('safety.model', 'Model')} value={form.model} onChange={v=>f('model',v)}/>
                    <FF t={t} label="Size" value={form.size} onChange={v=>f('size',v)}/><FF t={t} label="Tread Depth (32nds)" type="number" value={form.treadDepth} onChange={v=>f('treadDepth',v)}/>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel="Mount Tire"/>
            </Modal>
        )}
        {showScanner && (
            <InlineScanner 
                onClose={() => setShowScanner(false)} 
                onScan={(val) => {
                    setShowScanner(false);
                    const matchedVehicle = vehicles.find(v => String(v.UnitNumber).toLowerCase() === val.toLowerCase() || String(v.ID) === val);
                    if (matchedVehicle) {
                        f('vehicleId', matchedVehicle.ID);
                        window.trierToast?.success(`Scanned: ${matchedVehicle.UnitNumber}`);
                    } else {
                        window.trierToast?.error(`Unrecognized QR (Read: ${val}). Must be a valid Unit number.`);
                    }
                }} 
            />
        )}
        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
                    <ActionBar
                        title={`Tire — ${detail.UnitNumber} (${detail.Position})`}
                        icon={<CircleDot size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('fleet-tire-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                                <InfoRow label="Vehicle" value={detail.UnitNumber}/><InfoRow label="Position" value={detail.Position}/><InfoRow label="Serial #" value={detail.TireSerial}/>
                                <InfoRow label="Brand" value={detail.Brand}/><InfoRow label={t('safety.model', 'Model')} value={detail.Model}/><InfoRow label="Size" value={detail.Size}/>
                                <InfoRow label="Tread Depth" value={detail.TreadDepth!=null?`${detail.TreadDepth}/32"`:null}/><InfoRow label="Installed" value={formatDate(detail.DateInstalled)}/><InfoRow label={t('common.status', 'Status')} value={detail.Status}/>
                            </div>
                        ) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <FF t={t} label="Tire Serial" value={editForm.TireSerial} onChange={v=>ef('TireSerial',v)}/><FF t={t} label="Position" value={editForm.Position} onChange={v=>ef('Position',v)}/>
                                <FF t={t} label="Brand" value={editForm.Brand} onChange={v=>ef('Brand',v)}/><FF t={t} label={t('safety.model', 'Model')} value={editForm.Model} onChange={v=>ef('Model',v)}/>
                                <FF t={t} label="Size" value={editForm.Size} onChange={v=>ef('Size',v)}/><FF t={t} label="Tread Depth (32nds)" type="number" value={editForm.TreadDepth} onChange={v=>ef('TreadDepth',v)}/>
                                <FF t={t} label={t('common.status', 'Status')} value={editForm.Status} onChange={v=>ef('Status',v)} options={['In Service','Removed','Retread','Scrapped']}/>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════════════════════════ LICENSES ═══════════════════════════════════════════════════ */
function LicensesTab({ search, onTabData }) {
    const { t } = useTranslation();
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({ licenseClass:'A' });
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetchL = useCallback(()=>{setLoading(true);API('/licenses').then(r=>r.ok?r.json():[]).then(d=>{setLicenses(Array.isArray(d)?d:[]);setLoading(false);}).catch(()=>setLoading(false));},[]);
    useEffect(()=>{fetchL();},[fetchL]);

    const daysUntil = d=>{if(!d)return null;return Math.floor((new Date(d)-new Date())/86400000);};
    const expiryColor = d=>{if(d===null)return'#64748b';if(d<0)return'#ef4444';if(d<=30)return'#f59e0b';return'#10b981';};

    const filtered = useMemo(()=>{if(!search) return licenses;const s=search.toLowerCase();return licenses.filter(l=>[l.DriverName,l.LicenseNumber].some(x=>(x||'').toLowerCase().includes(s)));},[licenses,search]);
    useEffect(()=>{ onTabData && onTabData(filtered); },[filtered, onTabData]);

    const handleAdd = async()=>{if(!form.driverName) return window.trierToast?.warn('Driver name required');const r=await API('/licenses',{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({licenseClass:'A'});fetchL();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const startEdit = (item) => { setEditForm({ DriverName:item.DriverName||'', LicenseNumber:item.LicenseNumber||'', State:item.State||'', LicenseClass:item.LicenseClass||'A', Endorsements:item.Endorsements||'', IssueDate:item.IssueDate?.split('T')[0]||'', ExpiryDate:item.ExpiryDate?.split('T')[0]||'', MedicalCardExpiry:item.MedicalCardExpiry?.split('T')[0]||'', Notes:item.Notes||'' }); setEditing(true); };
    const handleSave = async () => { const r=await API(`/licenses/${detail.ID}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);fetchL();setDetail({...detail,...editForm});}else{const d=await r.json();window.trierToast?.error(d.error);} };

    const LicenseForm = () => (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
            <div style={{gridColumn:'span 2', display: 'flex', gap: 10}}>
                <button title="Scan Driver License Barcode (PDF417)" className="btn-nav" onClick={(e) => { e.preventDefault(); setShowScanner(true); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifySelf: 'flex-start', padding: 8, gap: 8, background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#06b6d4', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}><QrCode size={18} /> Scan DL Barcode</button>
            </div>
            <FF t={t} label="Driver Name" value={form.driverName} onChange={v=>f('driverName',v)} required/>
            <FF t={t} label="License Number" value={form.licenseNumber} onChange={v=>f('licenseNumber',v)}/>
            <FF t={t} label="State" value={form.state} onChange={v=>f('state',v)}/>
            <FF t={t} label="License Class" value={form.licenseClass} onChange={v=>f('licenseClass',v)} options={['A','B','C','D']}/>
            <FF t={t} label="Endorsements" value={form.endorsements} onChange={v=>f('endorsements',v)}/>
            <FF t={t} label="Issue Date" type="date" value={form.issueDate} onChange={v=>f('issueDate',v)}/>
            <FF t={t} label="Expiry Date" type="date" value={form.expiryDate} onChange={v=>f('expiryDate',v)}/>
            <FF t={t} label="Medical Card Expiry" type="date" value={form.medicalCardExpiry} onChange={v=>f('medicalCardExpiry',v)}/>
        </div>
    );

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingLicenses', 'Loading licenses...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><CreditCard size={24} color="#06b6d4"/> {t('fleet.tab.licenses')} ({filtered.length})</h2>
                <button title={t('fleet.addLicenseTip', 'Add a new CDL or driver license record')} className="btn-save" onClick={()=>{setForm({licenseClass:'A'});setShowAdd(true);}} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.addLicense', 'Add License')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('fleet.driver', 'Driver')}</th><th>{t('fleet.class', 'Class')}</th><th>{t('fleet.licenseNum', 'License #')}</th><th>{t('common.state', 'State')}</th><th>{t('fleet.endorsements', 'Endorsements')}</th><th>{t('fleet.expiry', 'Expiry')}</th><th>{t('fleet.medicalCard', 'Medical Card')}</th><th>{t('common.status', 'Status')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{filtered.map(l=>{const days=daysUntil(l.ExpiryDate);const medDays=daysUntil(l.MedicalCardExpiry);return(
                    <tr key={l.ID}><td style={{fontWeight:600}}>{l.DriverName}</td><td><Badge color="#6366f1">Class {l.LicenseClass}</Badge></td>
                    <td style={{fontFamily:'monospace'}}>{l.LicenseNumber||'—'}</td><td>{l.State||'—'}</td><td title="CDL endorsement codes: H=Hazmat, N=Tank, T=Doubles/Triples, X=Hazmat+Tank">{l.Endorsements||'—'}</td>
                    <td title={days!==null?`${days<0?Math.abs(days)+' days overdue':days+' days remaining'}`:'No expiry set'}><span style={{color:expiryColor(days),fontWeight:600}}>{formatDate(l.ExpiryDate)||'—'}{days!==null&&<span style={{fontSize:'0.7rem',marginLeft:6}}>({days<0?`${Math.abs(days)}d overdue`:`${days}d`})</span>}</span></td>
                    <td title={medDays!==null?`Medical card: ${medDays<0?Math.abs(medDays)+' days overdue':medDays+' days remaining'}`:'No medical card date'}><span style={{color:expiryColor(medDays),fontWeight:600,fontSize:'0.85rem'}}>{formatDate(l.MedicalCardExpiry)||'—'}</span></td>
                    <td><span className={statusClass(l.Status)}>{t('status.' + (l.Status || '').replace(/\s+/g, '').toLowerCase(), l.Status)}</span></td>
                    <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('fleet.viewLicenseTip', 'View license')} color="#3b82f6" onClick={()=>{setDetail(l);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('common.edit')} color="#f59e0b" onClick={()=>{setDetail(l);startEdit(l);}}/></td></tr>);
                })}{filtered.length===0&&<tr><td colSpan={9} className="table-empty">No licenses tracked yet.</td></tr>}</tbody></table>
            </div>
        </div>
        {showAdd && <Modal title="Add CDL / License" icon={CreditCard} color="#06b6d4" onClose={()=>setShowAdd(false)} width={550}><LicenseForm/><ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel="Save License"/></Modal>}
        {showScanner && (
            <InlineScanner 
                onClose={() => setShowScanner(false)} 
                onScan={(val) => {
                    setShowScanner(false);
                    try {
                        if (val.includes("ANSI")) {
                           const nameMatch = val.match(/DAA([^\n]+)/);
                           const lnumMatch = val.match(/DAQ([^\n]+)/);
                           if (nameMatch) f('driverName', nameMatch[1].trim());
                           if (lnumMatch) f('licenseNumber', lnumMatch[1].trim());
                           window.trierToast?.success(`License scanned successfully`);
                        } else {
                           window.trierToast?.info(`Scanned non-standard barcode`);
                        }
                        f('endorsements', val.substring(0, 30) + '...');
                    } catch(e) {
                           window.trierToast?.error(`Could not parse format`);
                    }
                }} 
            />
        )}
        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
                    <ActionBar
                        title={`License — ${detail.DriverName}`}
                        icon={<CreditCard size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('fleet-license-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                                <InfoRow label="Driver" value={detail.DriverName}/><InfoRow label="License #" value={detail.LicenseNumber}/><InfoRow label="Class" value={`Class ${detail.LicenseClass}`}/>
                                <InfoRow label="State" value={detail.State}/><InfoRow label="Endorsements" value={detail.Endorsements}/><InfoRow label={t('common.status', 'Status')} value={detail.Status}/>
                                <InfoRow label="Issue Date" value={formatDate(detail.IssueDate)}/><InfoRow label="Expiry Date" value={formatDate(detail.ExpiryDate)}/><InfoRow label="Med Card Expiry" value={formatDate(detail.MedicalCardExpiry)}/>
                            </div>
                        ) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <FF t={t} label="Driver Name" value={editForm.DriverName} onChange={v=>ef('DriverName',v)}/><FF t={t} label="License #" value={editForm.LicenseNumber} onChange={v=>ef('LicenseNumber',v)}/>
                                <FF t={t} label="State" value={editForm.State} onChange={v=>ef('State',v)}/><FF t={t} label="Class" value={editForm.LicenseClass} onChange={v=>ef('LicenseClass',v)} options={['A','B','C','D']}/>
                                <FF t={t} label="Endorsements" value={editForm.Endorsements} onChange={v=>ef('Endorsements',v)}/><FF t={t} label="Issue Date" type="date" value={editForm.IssueDate} onChange={v=>ef('IssueDate',v)}/>
                                <FF t={t} label="Expiry Date" type="date" value={editForm.ExpiryDate} onChange={v=>ef('ExpiryDate',v)}/><FF t={t} label="Med Card Expiry" type="date" value={editForm.MedicalCardExpiry} onChange={v=>ef('MedicalCardExpiry',v)}/>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.notes', 'Notes')} value={editForm.Notes} onChange={v=>ef('Notes',v)}/></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}

/* ═══════════════════════════════════════════════════ DOT ═══════════════════════════════════════════════════ */
function DOTTab({ search, vehicles, onTabData }) {
    const { t } = useTranslation();
    const [inspections, setInspections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [detail, setDetail] = useState(null);
    const [editing, setEditing] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [form, setForm] = useState({ result:'Pass', inspectionType:'Annual' });
    const f = (k,v)=>setForm(p=>({...p,[k]:v}));
    const ef = (k,v)=>setEditForm(p=>({...p,[k]:v}));

    const fetchDOT = useCallback(async ()=>{
        setLoading(true);
        try {
            const res = await API('/dot');
            if(res.ok) {
                const d = await res.json();
                setInspections((Array.isArray(d)?d:[]).sort((a,b)=>(b.InspectionDate||'').localeCompare(a.InspectionDate||'')));
            } else {
                const chunks = [];
                const vList = vehicles.slice(0, 20);
                for(let i=0; i<vList.length; i+=5) {
                    const batch = vList.slice(i, i+5);
                    const results = await Promise.all(batch.map(v=>API(`/vehicles/${v.ID}/dot-inspections`).then(r=>r.ok?r.json():[]).then(d=>(Array.isArray(d)?d:[]).map(i=>({...i,UnitNumber:v.UnitNumber}))).catch(()=>[])));
                    chunks.push(...results.flat());
                }
                setInspections(chunks.sort((a,b)=>(b.InspectionDate||'').localeCompare(a.InspectionDate||'')));
            }
        } catch (e) { console.warn('[FleetView] caught:', e); }
        setLoading(false);
    },[vehicles]);
    useEffect(()=>{if(vehicles.length>0)fetchDOT();else setLoading(false);},[vehicles,fetchDOT]);
    useEffect(()=>{ onTabData && onTabData(inspections); },[inspections, onTabData]);

    const handleAdd = async()=>{if(!form.vehicleId||!form.inspectionDate) return window.trierToast?.warn('Vehicle and Date required');const r=await API(`/vehicles/${form.vehicleId}/dot-inspection`,{method:'POST',body:JSON.stringify(form)});if(r.ok){setShowAdd(false);setForm({result:'Pass',inspectionType:'Annual'});fetchDOT();}else{const d=await r.json();window.trierToast?.error(d.error);}};
    const startEdit = (item) => { setEditForm({ InspectionDate:item.InspectionDate?.split('T')[0]||'', Inspector:item.Inspector||'', InspectionType:item.InspectionType||'Annual', Result:item.Result||'Pass', ViolationCount:item.ViolationCount||0, DecalNumber:item.DecalNumber||'', NextAnnualDue:item.NextAnnualDue?.split('T')[0]||'', Notes:item.Notes||'' }); setEditing(true); };
    const handleSave = async () => { const r=await API(`/dot/${detail.ID}`,{method:'PUT',body:JSON.stringify(editForm)});if(r.ok){setEditing(false);fetchDOT();setDetail({...detail,...editForm});}else{const d=await r.json();window.trierToast?.error(d.error);} };

    if(loading) return <div className="glass-card" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>{t('fleet.loadingDotInspections', 'Loading DOT inspections...')}</div>;
    return (<>
        <div className="glass-card" style={{flex:1,display:'flex',flexDirection:'column',padding:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <h2 style={{margin:0,display:'flex',alignItems:'center',gap:10}}><ShieldCheck size={24} color="#10b981"/> {t('fleet.tab.dot')} ({inspections.length})</h2>
                <button title={t('fleet.logANewFederalDotTip', 'Log a new federal DOT inspection with results and violations')} className="btn-save" onClick={()=>setShowAdd(true)} style={{height:36,display:'flex',alignItems:'center',gap:8}}><Plus size={16}/> {t('fleet.logInspection', 'Log Inspection')}</button>
            </div>
            <div className="table-container" style={{flex:1,overflowY:'auto'}}>
                <table className="data-table"><thead><tr><th>{t('common.date', 'Date')}</th><th>{t('fleet.vehicle', 'Vehicle')}</th><th>{t('fleet.inspector', 'Inspector')}</th><th>{t('common.type', 'Type')}</th><th>{t('fleet.result', 'Result')}</th><th>{t('fleet.violations', 'Violations')}</th><th>{t('fleet.decalNum', 'Decal #')}</th><th>{t('fleet.nextDue', 'Next Due')}</th><th>{t('common.actions', 'Actions')}</th></tr></thead>
                <tbody>{inspections.map(i=>(
                    <tr key={i.ID}><td>{formatDate(i.InspectionDate)}</td><td style={{fontWeight:600}}>{i.UnitNumber}</td><td>{i.Inspector||'—'}</td>
                    <td><Badge color="#6366f1">{i.InspectionType}</Badge></td>
                    <td title={i.Result==='Pass'?'Vehicle passed inspection with no violations':'Inspection resulted in findings — review violations'}>{i.Result==='Pass'?<span className={statusClass('Completed')}>✓ Pass</span>:<span className={statusClass('Overdue')}>✗ {i.Result}</span>}</td>
                    <td>{i.ViolationCount||0}</td><td style={{fontFamily:'monospace',fontSize:'0.75rem'}}>{i.DecalNumber||'—'}</td>
                    <td title={i.NextAnnualDue?`Next annual DOT inspection due ${i.NextAnnualDue}`:'No due date set'}>{formatDate(i.NextAnnualDue)||'—'}</td>
                    <td style={{display:'flex',gap:2}}><ActionBtn icon={Eye} tip={t('fleet.viewInspectionTip', 'View inspection')} color="#3b82f6" onClick={()=>{setDetail(i);setEditing(false);}}/><ActionBtn icon={Pencil} tip={t('common.edit')} color="#f59e0b" onClick={()=>{setDetail(i);startEdit(i);}}/></td></tr>
                ))}{inspections.length===0&&<tr><td colSpan={9} className="table-empty">{t('fleet.noDotInspectionsRecorded', 'No DOT inspections recorded.')}</td></tr>}</tbody></table>
            </div>
        </div>
        {showAdd && (
            <Modal title="Log DOT Inspection" icon={ShieldCheck} color="#10b981" onClose={()=>setShowAdd(false)} width={550}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                    <div style={{gridColumn:'span 2'}}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Vehicle *</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                                <VehicleSelect value={form.vehicleId} onChange={v=>f('vehicleId',v)} vehicles={vehicles}/>
                            </div>
                            <button title="Scan QR sticker to select vehicle" className="btn-nav" onClick={(e) => { e.preventDefault(); setShowScanner(true); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(234, 88, 12, 0.1)', border: '1px solid rgba(234, 88, 12, 0.3)', color: '#ea580c', borderRadius: 8, padding: '0 12px', cursor: 'pointer' }}>
                                <QrCode size={18} />
                            </button>
                        </div>
                    </div>
                    <FF t={t} label="Inspection Date" type="date" value={form.inspectionDate} onChange={v=>f('inspectionDate',v)} required/>
                    <FF t={t} label="Inspector Name" value={form.inspector} onChange={v=>f('inspector',v)}/>
                    <FF t={t} label="Inspection Type" value={form.inspectionType} onChange={v=>f('inspectionType',v)} options={['Annual','Random','Roadside','Follow-Up']}/>
                    <FF t={t} label="Result" value={form.result} onChange={v=>f('result',v)} options={['Pass','Fail','Conditional Pass','Out of Service']}/>
                    <FF t={t} label="Violations" type="number" value={form.violationCount} onChange={v=>f('violationCount',v)}/>
                    <FF t={t} label="Decal Number" value={form.decalNumber} onChange={v=>f('decalNumber',v)}/>
                    <FF t={t} label="Next Annual Due" type="date" value={form.nextAnnualDue} onChange={v=>f('nextAnnualDue',v)}/>
                    <FF t={t} label={t('common.notes', 'Notes')} value={form.notes} onChange={v=>f('notes',v)}/>
                </div>
                <ModalActions t={t} onCancel={()=>setShowAdd(false)} onSave={handleAdd} saveLabel="Save Inspection"/>
            </Modal>
        )}
        {showScanner && (
            <InlineScanner 
                onClose={() => setShowScanner(false)} 
                onScan={(val) => {
                    setShowScanner(false);
                    const matchedVehicle = vehicles.find(v => String(v.UnitNumber).toLowerCase() === val.toLowerCase() || String(v.ID) === val);
                    if (matchedVehicle) {
                        f('vehicleId', matchedVehicle.ID);
                        window.trierToast?.success(`Scanned: ${matchedVehicle.UnitNumber}`);
                    } else {
                        window.trierToast?.error(`Unrecognized QR (Read: ${val}). Must be a valid Unit number.`);
                    }
                }} 
            />
        )}
        {detail && (
            <div className="modal-overlay" onClick={()=>{setDetail(null);setEditing(false);}}>
                <div className="glass-card modal-content-standard" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
                    <ActionBar
                        title={`DOT Inspection — ${detail.UnitNumber}`}
                        icon={<ShieldCheck size={20} />}
                        isEditing={editing}
                        onEdit={() => startEdit(detail)}
                        onSave={handleSave}
                        onPrint={() => window.triggerTrierPrint('fleet-dot-detail', detail)}
                        onClose={() => { setDetail(null); setEditing(false); }}
                        onCancel={() => setEditing(false)}
                        showDelete={false}
                    />
                    <div style={{padding:20}}>
                        {!editing ? (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                                <InfoRow label={t('common.date', 'Date')} value={formatDate(detail.InspectionDate)}/><InfoRow label="Vehicle" value={detail.UnitNumber}/><InfoRow label="Inspector" value={detail.Inspector}/>
                                <InfoRow label={t('common.type', 'Type')} value={detail.InspectionType}/><InfoRow label="Result" value={detail.Result}/><InfoRow label="Violations" value={detail.ViolationCount}/>
                                <InfoRow label="Decal #" value={detail.DecalNumber}/><InfoRow label={t('safety.nextDue', 'Next Due')} value={formatDate(detail.NextAnnualDue)}/><InfoRow label={t('common.notes', 'Notes')} value={detail.Notes}/>
                            </div>
                        ) : (
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:15}}>
                                <FF t={t} label="Inspection Date" type="date" value={editForm.InspectionDate} onChange={v=>ef('InspectionDate',v)}/><FF t={t} label="Inspector" value={editForm.Inspector} onChange={v=>ef('Inspector',v)}/>
                                <FF t={t} label={t('common.type', 'Type')} value={editForm.InspectionType} onChange={v=>ef('InspectionType',v)} options={['Annual','Random','Roadside','Follow-Up']}/><FF t={t} label="Result" value={editForm.Result} onChange={v=>ef('Result',v)} options={['Pass','Fail','Conditional Pass','Out of Service']}/>
                                <FF t={t} label="Violations" type="number" value={editForm.ViolationCount} onChange={v=>ef('ViolationCount',v)}/><FF t={t} label="Decal #" value={editForm.DecalNumber} onChange={v=>ef('DecalNumber',v)}/>
                                <FF t={t} label="Next Annual Due" type="date" value={editForm.NextAnnualDue} onChange={v=>ef('NextAnnualDue',v)}/>
                                <div style={{gridColumn:'span 2'}}><FF t={t} label={t('common.notes', 'Notes')} value={editForm.Notes} onChange={v=>ef('Notes',v)}/></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
    </>);
}
