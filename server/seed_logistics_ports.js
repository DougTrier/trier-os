// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Logistics & Ports Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['LOG-CRANE-STS', 'Ship-to-shore container crane', 'CRANE', '["ZPMC","Liebherr","Konecranes"]', 30, '["wire_rope_kink_fatigue","sheave_groove_wear","twist_lock_mechanism_jam","festoon_cable_abrasion","wind_speed_trip"]', 4000, 4.0, 15, 20, '{"locationGisCapable":true,"liftCapacity_t":65,"spanM":30}'],
    ['LOG-CRANE-RTG', 'Rubber-tired gantry crane (RTG)', 'CRANE', '["Konecranes","ZPMC","Kalmar"]', 30, '["rubber_tyre_delamination","drive_motor_insulation_fault","spreader_flipper_solenoid_fail","gantry_rail_misalignment"]', 5000, 3.5, 12, 15, '{"locationGisCapable":true,"liftCapacity_t":41,"stackHeight_m":18}'],
    ['LOG-CRANE-RMG', 'Rail-mounted gantry crane (RMG)', 'CRANE', '["Konecranes","Kuenz","ZPMC"]', 30, '["cable_reel_slip_ring_wear","bogie_wheel_flange_wear","hoist_drum_brake_fade","spreader_cable_snap"]', 6000, 3.0, 15, 20, '{"locationGisCapable":true,"liftCapacity_t":41,"spanM":40}'],
    ['LOG-CRANE-MOB', 'Mobile harbor crane', 'CRANE', '["Liebherr","Konecranes Gottwald"]', 30, '["slewing_ring_bearing_wear","luffing_cylinder_leak","outrigger_pad_damage","diesel_engine_overheat"]', 3500, 4.0, 10, 15, '{"locationGisCapable":true,"liftCapacity_t":100}'],
    ['LOG-REACH-STK', 'Reach stacker', 'HAULAGE', '["Kalmar","Hyster","Konecranes","SANY"]', 14, '["boom_telescope_cylinder_seal_blowout","spreader_tilt_cylinder_leak","engine_turbo_surge","parking_brake_drag"]', 3000, 3.0, 10, 10, '{"locationGisCapable":true,"liftCapacity_t":45,"stackHeight_m":15}'],
    ['LOG-FORK-IC', 'IC counterbalance forklift', 'HAULAGE', '["Toyota","Linde","Hyster"]', 30, '["mast_roller_bearing_wear","transmission_torque_converter_leak","fork_heel_wear","radiator_clog"]', 2000, 2.0, 7, 7, '{"locationGisCapable":true,"liftCapacity_t":3}'],
    ['LOG-FORK-EL', 'Electric counterbalance forklift', 'HAULAGE', '["Toyota","Jungheinrich","Crown"]', 30, '["battery_cell_degradation","traction_motor_encoder_fault","contactor_contact_weld","mast_chain_stretch"]', 3000, 1.5, 7, 8, '{"locationGisCapable":true,"liftCapacity_t":2.5}'],
    ['LOG-CONV-SORT', 'Roller conveyor sorter (sortation)', 'CONVEYING', '["Dematic","Vanderlande","Intelligrated"]', 30, '["pop_up_wheel_module_jam","drive_belt_snap","photo_eye_sensor_misalign","roller_bearing_seize"]', 5000, 1.5, 10, 12, '{"locationGisCapable":true,"spanM":100}'],
    ['LOG-AGV-STRAD', 'Automated straddle carrier', 'HAULAGE', '["Kalmar","Konecranes","ZPMC"]', 14, '["laser_navigation_scanner_fault","hoist_rope_wear","diesel_electric_genset_trip","wheel_motor_leak"]', 4000, 3.0, 8, 12, '{"locationGisCapable":true,"liftCapacity_t":60}'],
    ['LOG-REEFER-UNIT', 'Refrigerated container (reefer) unit', 'REFRIGERATION', '["Carrier Transicold","Thermo King","Daikin"]', 90, '["compressor_discharge_valve_leak","evaporator_coil_icing","controller_board_fault","refrigerant_undercharge"]', 6000, 2.0, 5, 8, '{"locationGisCapable":true,"refrigerantType":"R-404A/R-452A"}'],
    ['LOG-TRUCK-TRL', 'Heavy truck and trailer (skeletal/flatbed)', 'HAULAGE', '["Volvo","Scania","Mercedes-Benz","Man"]', 30, '["air_brake_chamber_diaphragm_tear","fifth_wheel_jaw_wear","trailer_suspension_air_bag_leak","diesel_dpf_clog"]', 2500, 3.0, 10, 10, '{"locationGisCapable":true,"liftCapacity_t":40}'],
    ['LOG-PUMP-BILGE', 'Harbor bilge / ballast pump', 'FLUID_HANDLING', '["Flygt","KSB","Gorman-Rupp"]', 90, '["impeller_blockage_debris","mechanical_seal_leak","suction_hose_collapse","motor_stator_moisture"]', 4000, 2.5, 10, 10, '{"locationGisCapable":true,"liftCapacity_t":0}']
];

const parts = [
    ['LOG-WIRE-ROPE-35', 'STS Crane Wire Rope 35mm IPS/IWRC Steel Core (per meter)', 'WIRE ROPE, 35MM, IPS/IWRC', 'Bridon-Bekaert', 'MECHANICAL', 'Wire Rope', 'M', 18, 40, 21, '{"diameter_mm":35,"type":"IPS/IWRC","core":"Steel"}', '[]', '["LOG-CRANE-STS"]', 'wire,rope,crane,35mm,sts'],
    ['LOG-SHEAVE-DRUM-01', 'Large Crane Rope Drum Sheave Grooved Cast Steel', 'SHEAVE, ROPE DRUM, GROOVED', 'Crosby', 'MECHANICAL', 'Crane Components', 'EA', 800, 2500, 30, '{"material":"Cast Steel","type":"Grooved"}', '[]', '["LOG-CRANE-STS","LOG-CRANE-RMG"]', 'sheave,drum,crane,rope'],
    ['LOG-TWIST-LOCK-SET', 'Spreader Headblock Twist Lock Set (4 Twist Locks)', 'TWIST LOCK SET, SPREADER, 4-PIECE', 'Bromma', 'MECHANICAL', 'Spreader Components', 'SET', 2000, 5000, 21, '{"quantity":4}', '[]', '["LOG-CRANE-STS","LOG-CRANE-RTG","LOG-CRANE-RMG","LOG-REACH-STK"]', 'twist,lock,spreader,set'],
    ['LOG-TYRE-RTG-01', 'RTG Crane Rubber Drive Tyre Large Diameter', 'TYRE, RTG CRANE DRIVE', 'Michelin', 'MECHANICAL', 'Tires', 'EA', 2000, 6000, 45, '{"application":"RTG Crane"}', '[]', '["LOG-CRANE-RTG"]', 'tyre,tire,rtg,crane,rubber'],
    ['LOG-FESTOON-CAB-50', 'Crane Festoon Cable Assembly Trolley Power/Comms 50m', 'CABLE, FESTOON, 50M', 'Prysmian', 'ELECTRICAL', 'Cables', 'SET', 1500, 4000, 30, '{"length_m":50,"type":"Power/Comms"}', '[]', '["LOG-CRANE-STS","LOG-CRANE-RMG"]', 'festoon,cable,crane,trolley'],
    ['LOG-SENSOR-LIDAR', 'Crane Anti-Collision Lidar Sensor', 'SENSOR, LIDAR, ANTI-COLLISION', 'Sick', 'INSTRUMENTATION', 'Sensors', 'EA', 1200, 3500, 14, '{"type":"Lidar","application":"Anti-Collision"}', '[]', '["LOG-CRANE-STS","LOG-CRANE-RTG","LOG-CRANE-RMG"]', 'sensor,lidar,collision,crane'],
    ['LOG-SEAL-BOOM-01', 'Reach Stacker Boom Telescope Cylinder Seal Kit', 'SEAL KIT, BOOM CYLINDER', 'Hallite', 'SEALS', 'Hydraulic Seals', 'SET', 200, 600, 14, '{"application":"Telescope Cylinder"}', '[]', '["LOG-REACH-STK"]', 'seal,kit,boom,cylinder,reach,stacker'],
    ['LOG-CHAIN-LEAF-80', 'Forklift Leaf Chain #80 (per meter)', 'CHAIN, LEAF, #80', 'Rexnord', 'MECHANICAL', 'Chains', 'M', 30, 80, 5, '{"pitch":"#80","type":"Leaf"}', '["REXNORD-40-1R-10"]', '["LOG-FORK-IC","LOG-FORK-EL"]', 'chain,leaf,forklift,80'],
    ['LOG-BRAKE-PAD-IC', 'Forklift IC Brake Pad Set', 'BRAKE PAD SET, FORKLIFT IC', 'Toyota', 'MECHANICAL', 'Brakes', 'SET', 50, 150, 5, '{"application":"IC Forklift"}', '[]', '["LOG-FORK-IC"]', 'brake,pad,set,forklift'],
    ['LOG-BATT-LEAD-48V', 'Forklift 48V Traction Battery Lead-Acid', 'BATTERY, 48V, LEAD-ACID', 'EnerSys', 'ELECTRICAL', 'Batteries', 'EA', 2500, 5000, 21, '{"voltage":"48V","chemistry":"Lead-Acid"}', '[]', '["LOG-FORK-EL"]', 'battery,48v,lead,acid,forklift'],
    ['LOG-BATT-LI-48V', 'Forklift 48V Traction Battery Lithium-Ion', 'BATTERY, 48V, LITHIUM-ION', 'Flux Power', 'ELECTRICAL', 'Batteries', 'EA', 6000, 12000, 30, '{"voltage":"48V","chemistry":"Lithium-Ion"}', '[]', '["LOG-FORK-EL"]', 'battery,48v,lithium,ion,forklift'],
    ['LOG-FLTR-HYD-01', 'Forklift Hydraulic Oil Filter', 'FILTER, HYDRAULIC OIL, FORKLIFT', 'Donaldson', 'FILTERS', 'Hydraulic Filters', 'EA', 20, 60, 5, '{"application":"Forklift Hydraulic"}', '[]', '["LOG-FORK-IC","LOG-FORK-EL","LOG-REACH-STK"]', 'filter,hydraulic,oil,forklift'],
    ['LOG-COMPR-REEF-01', 'Reefer Unit Compressor', 'COMPRESSOR, REEFER UNIT', 'Carrier Transicold', 'MECHANICAL', 'Compressors', 'EA', 1500, 3500, 21, '{"application":"Refrigerated Container"}', '[]', '["LOG-REEFER-UNIT"]', 'compressor,reefer,unit'],
    ['LOG-FAN-MTR-REEF', 'Reefer Unit Evaporator Fan Motor Small Frame', 'MOTOR, EVAPORATOR FAN, REEFER', 'Thermo King', 'ELECTRICAL', 'Motors', 'EA', 200, 500, 10, '{"application":"Reefer Evaporator"}', '[]', '["LOG-REEFER-UNIT"]', 'motor,fan,evaporator,reefer'],
    ['LOG-BRK-CHM-3030', 'Truck Air Brake Chamber Type 30/30 Spring Brake', 'BRAKE CHAMBER, AIR, 30/30 SPRING', 'Bendix', 'MECHANICAL', 'Brakes', 'EA', 80, 200, 7, '{"type":"30/30 Spring"}', '[]', '["LOG-TRUCK-TRL"]', 'brake,chamber,air,truck'],
    ['LOG-TYRE-31580R225', 'Truck Trailer Tyre 315/80R22.5', 'TYRE, TRUCK TRAILER, 315/80R22.5', 'Michelin', 'MECHANICAL', 'Tires', 'EA', 500, 900, 14, '{"size":"315/80R22.5"}', '[]', '["LOG-TRUCK-TRL"]', 'tyre,tire,truck,trailer'],
    ['LOG-SORT-POPUP-01', 'Conveyor Sorter Pop-Up Wheel Module Divert Module', 'MODULE, POP-UP WHEEL, DIVERT', 'Dematic', 'MECHANICAL', 'Conveyor Components', 'EA', 300, 800, 21, '{"type":"Pop-Up Divert","includes_motor":true}', '[]', '["LOG-CONV-SORT"]', 'module,popup,wheel,divert,sorter'],
    ['LOG-HOOK-SWVL-80T', 'Large Crane Swivel Hook with Safety Latch 80t Rated', 'HOOK, SWIVEL, 80T, SAFETY LATCH', 'Crosby', 'MECHANICAL', 'Lifting Gear', 'EA', 1500, 4000, 30, '{"capacity_t":80,"type":"Swivel"}', '[]', '["LOG-CRANE-STS","LOG-CRANE-MOB"]', 'hook,swivel,crane,80t,safety']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'LOG-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'LOG-%'`).get().c;

console.log(`✅ Seed Logistics & Ports Complete`);
console.log(`   📦 LOG Equipment Types: ${totalE}`);
console.log(`   📦 LOG Master Parts: ${totalP}`);
db.close();
