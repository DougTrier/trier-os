// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Energy Plants Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['ENR-TURB-STEAM', 'Steam turbine (condensing)', 'GENERATION', '["GE","Siemens","Mitsubishi Power","Doosan"]', 180, '["blade_erosion_pitting","labyrinth_seal_wear","thrust_bearing_high_temp","governor_valve_hunting","lube_oil_contamination"]', 20000, 12.0, 30, 24, '{"locationGisCapable":true,"capacityMW":500,"pressureClass_bar":160}'],
    ['ENR-TURB-GAS', 'Gas turbine (open cycle)', 'GENERATION', '["GE","Siemens","Mitsubishi Power","Ansaldo Energia"]', 90, '["hot_section_blade_creep","combustor_liner_cracking","compressor_fouling","inlet_filter_clog","fuel_nozzle_coking"]', 8000, 10.0, 25, 24, '{"locationGisCapable":true,"capacityMW":250}'],
    ['ENR-TURB-HRSG', 'Heat recovery steam generator (HRSG)', 'HEAT_RECOVERY', '["Nooter/Eriksen","John Cockerill","Vogt Power"]', 180, '["tube_fin_fouling","superheater_tube_creep","expansion_joint_crack","exhaust_bypass_damper_jam"]', 25000, 8.0, 30, 24, '{"locationGisCapable":true,"pressureClass_bar":150}'],
    ['ENR-GEN-SYNC', 'Synchronous generator (large frame)', 'GENERATION', '["GE","Siemens","ABB","Hitachi"]', 180, '["stator_wedge_looseness","rotor_winding_short","hydrogen_seal_leak","slip_ring_brush_wear"]', 30000, 6.0, 40, 24, '{"locationGisCapable":true,"voltageClass_kV":18,"capacityMW":500}'],
    ['ENR-XFMR-MAIN', 'Power transformer step-up/step-down', 'ELECTRICAL', '["ABB","Siemens","Hitachi Energy","GE"]', 365, '["oil_moisture_ingress","bushing_flashover","tap_changer_contact_wear","cooling_fan_failure"]', 50000, 4.0, 40, 36, '{"locationGisCapable":true,"voltageClass_kV":400}'],
    ['ENR-SWGR-MV', 'Medium-voltage switchgear (6.6kV / 11kV)', 'ELECTRICAL', '["ABB","Siemens","Schneider Electric","Eaton"]', 180, '["vacuum_bottle_loss","busbar_corona_discharge","protection_relay_fault","rack_in_mechanism_jam"]', 20000, 3.0, 25, 24, '{"locationGisCapable":true,"voltageClass_kV":11}'],
    ['ENR-BRKR-SF6', 'SF6 circuit breaker', 'ELECTRICAL', '["ABB","Siemens","Hitachi Energy","GE"]', 180, '["sf6_gas_pressure_low","spring_energy_store_fault","interrupter_contact_wear","auxiliary_switch_misalignment"]', 15000, 4.0, 30, 24, '{"locationGisCapable":true,"voltageClass_kV":132}'],
    ['ENR-COOL-TWR', 'Mechanical draft cooling tower', 'COOLING', '["SPX Cooling","Baltimore Aircoil","Marley"]', 90, '["fill_media_scaling","drift_eliminator_clog","gearbox_oil_leak","basin_corrosion","fan_blade_imbalance"]', 10000, 4.0, 20, 12, '{"locationGisCapable":true,"capacityMW":100}'],
    ['ENR-PUMP-COND', 'Condensate extraction pump', 'FLUID_HANDLING', '["Flowserve","Sulzer","KSB","Ruhrpumpen"]', 90, '["mechanical_seal_leak","cavitation_erosion","thrust_bearing_wear","coupling_alignment_fault"]', 15000, 6.0, 20, 12, '{"locationGisCapable":true,"pressureClass_bar":20}'],
    ['ENR-PUMP-BFW', 'Boiler feedwater pump (high-pressure)', 'FLUID_HANDLING', '["Flowserve","Sulzer","KSB"]', 90, '["balance_disc_wear","axial_thrust_bearing_failure","mechanical_seal_blowout","impeller_cavitation"]', 12000, 8.0, 25, 12, '{"locationGisCapable":true,"pressureClass_bar":200}'],
    ['ENR-COMPR-IA', 'Instrument air compressor', 'UTILITIES', '["Atlas Copco","Ingersoll Rand","Kaeser"]', 30, '["air_end_bearing_wear","oil_separator_clog","blowdown_valve_stick","cooler_fouling"]', 8000, 3.0, 15, 12, '{"locationGisCapable":true,"pressureClass_bar":10}'],
    ['ENR-BOILER-WTB', 'Water-tube boiler / steam drum', 'GENERATION', '["Babcock & Wilcox","Doosan","Mitsubishi Power"]', 180, '["water_wall_tube_rupture","economizer_corrosion","burner_management_fault","safety_valve_lift"]', 20000, 10.0, 35, 24, '{"locationGisCapable":true,"pressureClass_bar":180}']
];

const parts = [
    ['ENR-BRG-TPJ-01', 'Steam Turbine Tilting-Pad Journal Bearing 12in', 'BEARING, JOURNAL, TILTING-PAD, 12IN', 'Waukesha Bearings', 'BEARINGS', 'Hydrodynamic', 'EA', 5000, 15000, 45, '{"bore_in":12,"type":"Tilting-Pad"}', '["SKF-22212-E"]', '["ENR-TURB-STEAM","ENR-TURB-GAS"]', 'bearing,journal,tilting,pad,turbine'],
    ['ENR-SEAL-LAB-01', 'Turbine Labyrinth Shaft Seal Set', 'SEAL, LABYRINTH, TURBINE', 'Elliott Group', 'SEALS', 'Labyrinth Seals', 'SET', 2000, 6000, 30, '{"material":"Bronze/Alloy"}', '[]', '["ENR-TURB-STEAM","ENR-TURB-GAS"]', 'seal,labyrinth,shaft,turbine'],
    ['ENR-BLADE-LP-01', 'Turbine Blade Set, Last-Stage LP, Ti-Coated', 'BLADE SET, TURBINE LP, TI-COATED', 'Siemens', 'MECHANICAL', 'Turbine Internals', 'SET', 15000, 60000, 120, '{"stage":"Last LP","material":"Titanium-Coated Stainless"}', '[]', '["ENR-TURB-STEAM"]', 'blade,turbine,lp,stage'],
    ['ENR-STATOR-WEDGE', 'Generator Stator Slot Wedge Set Glass-Epoxy', 'WEDGE SET, STATOR SLOT', 'Isovolta', 'ELECTRICAL', 'Generator Components', 'SET', 800, 2500, 30, '{"material":"Glass-Epoxy"}', '[]', '["ENR-GEN-SYNC"]', 'wedge,stator,slot,generator'],
    ['ENR-XFMR-FILTER', 'Power Transformer Insulating Oil Filter Cartridge', 'FILTER, OIL, TRANSFORMER', 'Pall', 'FILTERS', 'Oil Filters', 'EA', 150, 400, 7, '{"media":"Cellulose"}', '[]', '["ENR-XFMR-MAIN"]', 'filter,oil,insulating,transformer'],
    ['ENR-BUSHING-HV-110', 'Transformer HV Bushing Porcelain 110kV', 'BUSHING, HV, 110KV, PORCELAIN', 'ABB', 'ELECTRICAL', 'Bushings', 'EA', 5000, 12000, 60, '{"voltage_kV":110,"material":"Porcelain"}', '[]', '["ENR-XFMR-MAIN"]', 'bushing,hv,transformer,porcelain'],
    ['ENR-SF6-INT-MOD', 'SF6 Circuit Breaker Interrupter Module', 'INTERRUPTER MODULE, SF6', 'Siemens', 'ELECTRICAL', 'Switchgear Components', 'EA', 3000, 8000, 45, '{"gas":"SF6"}', '[]', '["ENR-BRKR-SF6"]', 'interrupter,sf6,breaker'],
    ['ENR-SF6-GAS-CYL', 'SF6 Gas Refill Cylinder IEC Purity Grade 50kg', 'GAS, SF6, IEC PURITY, 50KG', 'Solvay', 'CONSUMABLES', 'Gases', 'CYL', 800, 2000, 14, '{"gas":"SF6","weight_kg":50,"grade":"IEC"}', '[]', '["ENR-BRKR-SF6","ENR-SWGR-MV"]', 'gas,sf6,cylinder,refill'],
    ['ENR-CT-FILL-PVC', 'Cooling Tower PVC Fill Media Pack 1m3', 'FILL MEDIA, COOLING TOWER, PVC, 1M3', 'Brentwood', 'MECHANICAL', 'Cooling Tower', 'EA', 150, 350, 14, '{"volume_m3":1,"material":"PVC"}', '[]', '["ENR-COOL-TWR"]', 'fill,media,pvc,cooling,tower'],
    ['ENR-CT-DRIFT-ELM', 'Cooling Tower Drift Eliminator Panel', 'DRIFT ELIMINATOR, COOLING TOWER', 'Munters', 'MECHANICAL', 'Cooling Tower', 'EA', 80, 200, 14, '{"material":"PVC"}', '[]', '["ENR-COOL-TWR"]', 'drift,eliminator,cooling,tower'],
    ['ENR-TX-PRESS-100', 'Pressure Transmitter 4-20mA Flanged 0-100 Bar', 'TRANSMITTER, PRESSURE, 0-100 BAR', 'Emerson', 'INSTRUMENTATION', 'Transmitters', 'EA', 600, 1500, 14, '{"range_bar":"0-100","output":"4-20mA","connection":"Flanged"}', '[]', '["ENR-TURB-STEAM","ENR-BOILER-WTB","ENR-PUMP-BFW"]', 'transmitter,pressure,instrument'],
    ['ENR-SEN-RTD-PT100', 'Pt100 RTD Temperature Sensor Thermowell Mount', 'SENSOR, TEMP, RTD PT100', 'Endress+Hauser', 'INSTRUMENTATION', 'Sensors', 'EA', 150, 400, 7, '{"type":"Pt100 RTD","mount":"Thermowell"}', '[]', '["ENR-TURB-STEAM","ENR-TURB-GAS","ENR-BOILER-WTB"]', 'sensor,temperature,rtd,pt100'],
    ['ENR-FLOW-TURB-2', 'Insertion Turbine Flow Meter 2-inch Process', 'FLOW METER, TURBINE, 2IN', 'Yokogawa', 'INSTRUMENTATION', 'Meters', 'EA', 1200, 3000, 21, '{"size_in":2,"type":"Insertion Turbine"}', '[]', '["ENR-PUMP-COND","ENR-PUMP-BFW"]', 'flow,meter,turbine,insertion'],
    ['ENR-VALVE-SRV-01', 'Safety Relief Valve Spring-Loaded ASME Coded', 'VALVE, SAFETY RELIEF, SPRING', 'Crosby', 'VALVES', 'Relief Valves', 'EA', 1500, 4000, 30, '{"type":"Spring-Loaded","code":"ASME"}', '[]', '["ENR-BOILER-WTB","ENR-TURB-STEAM"]', 'valve,safety,relief,srv,asme'],
    ['ENR-TUBE-T91-6M', 'Boiler Water-Tube Alloy Steel SA-213 T91 6m', 'TUBE, BOILER, SA-213 T91, 6M', 'Vallourec', 'MECHANICAL', 'Piping/Tubing', 'EA', 300, 800, 14, '{"material":"SA-213 T91","length_m":6}', '[]', '["ENR-BOILER-WTB","ENR-TURB-HRSG"]', 'tube,boiler,water,alloy,t91'],
    ['ENR-ACT-MOV-FC', 'High-Pressure Isolation Valve Actuator Electric Fail-Closed', 'ACTUATOR, VALVE, ELECTRIC, FAIL-CLOSED', 'Rotork', 'VALVES', 'Actuators', 'EA', 2000, 5000, 30, '{"type":"Electric","fail_state":"Closed"}', '[]', '["ENR-TURB-STEAM","ENR-BOILER-WTB"]', 'actuator,valve,electric,mov'],
    ['ENR-CPL-FLUID-01', 'Hydraulic Fluid Coupling Turbine-to-Feed Pump Drive', 'COUPLING, FLUID, HYDRAULIC', 'Voith', 'MECHANICAL', 'Power Transmission', 'EA', 8000, 20000, 60, '{"type":"Fluid Coupling"}', '[]', '["ENR-TURB-STEAM","ENR-PUMP-BFW"]', 'coupling,fluid,hydraulic,drive'],
    ['ENR-SEAL-MECH-COND', 'Condensate Pump Mechanical Seal Set', 'SEAL SET, MECHANICAL, CONDENSATE PUMP', 'John Crane', 'SEALS', 'Mechanical Seals', 'SET', 1500, 4000, 21, '{"type":"Mechanical"}', '["PUMP-SEAL-MECH-175"]', '["ENR-PUMP-COND"]', 'seal,mechanical,condensate,pump']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'ENR-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'ENR-%'`).get().c;

console.log(`✅ Seed Energy Plants Complete`);
console.log(`   📦 ENR Equipment Types: ${totalE}`);
console.log(`   📦 ENR Master Parts: ${totalP}`);
db.close();
