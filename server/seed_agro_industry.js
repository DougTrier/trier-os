// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Agro-Industry Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['AGR-HARV-GRAIN', 'Grain combine harvester', 'HARVESTING', '["John Deere","Case IH","Claas","New Holland"]', 60, '["concave_wear_crop_loss","feeder_house_chain_break","cutter_bar_knife_fracture","grain_tank_unload_auger_shear","cleaning_shoe_sieve_clog"]', 2000, 4.0, 10, 10, '{"locationGisCapable":true,"grainCapacity_bu":400,"horsepower":500}'],
    ['AGR-HARV-FORAGE', 'Forage harvester (self-propelled chopper)', 'HARVESTING', '["Claas","John Deere","Krone"]', 60, '["chopper_drum_knife_dull","crop_intake_roller_slip","spout_deflector_hydraulic_leak","kernel_processor_bearing_wear"]', 1500, 5.0, 8, 8, '{"locationGisCapable":true,"horsepower":800,"processingCapacity_tph":300}'],
    ['AGR-TRACTOR-LG', 'Large articulated 4WD tractor (300hp+)', 'TRACTION', '["John Deere","Case IH (Steiger)","Versatile"]', 90, '["articulation_joint_pin_wear","transmission_powershift_slip","pto_clutch_wear","hydraulic_scv_leak"]', 4000, 3.0, 12, 10, '{"locationGisCapable":true,"horsepower":400}'],
    ['AGR-SPRAYER-SP', 'Self-propelled sprayer', 'CROP_PROTECTION', '["John Deere","Case IH","Hagie","RoGator"]', 30, '["boom_suspension_air_bag_leak","nozzle_plugging","solution_pump_diaphragm_rupture","wheel_motor_hydraulic_leak"]', 2500, 3.5, 10, 8, '{"locationGisCapable":true,"workingWidthM":36,"horsepower":300}'],
    ['AGR-IRRIG-CP', 'Center pivot irrigation system', 'IRRIGATION', '["Valley","Zimmatic","Reinke"]', 180, '["drive_unit_gearbox_oil_seal_leak","tower_drive_motor_burn","pivot_point_bearing_wear","span_pipe_corrosion"]', 8000, 4.0, 20, 15, '{"locationGisCapable":true,"workingWidthM":400}'],
    ['AGR-PUMP-IRRIG', 'Irrigation centrifugal pump (diesel-driven)', 'IRRIGATION', '["Cornell","Gorman-Rupp","Berkeley"]', 90, '["mechanical_seal_dry_run_failure","impeller_sand_abrasion","diesel_engine_overheat","priming_system_vacuum_leak"]', 5000, 2.5, 12, 10, '{"locationGisCapable":true,"horsepower":150}'],
    ['AGR-ELEV-BUCKET', 'Grain bucket elevator', 'GRAIN_HANDLING', '["GSI","Brock","Sukup"]', 180, '["elevator_belt_slip_and_burn","bucket_bolt_shear","head_pulley_lagging_wear","boot_bearing_dust_contamination"]', 10000, 3.0, 25, 20, '{"locationGisCapable":true,"processingCapacity_tph":200}'],
    ['AGR-DRYER-GRAIN', 'Continuous-flow grain dryer (propane/gas)', 'GRAIN_HANDLING', '["GSI","Brock","Mathews Company"]', 90, '["burner_ignition_fault","plenum_temperature_sensor_drift","conveying_auger_shear_bolt_break","combustion_blower_belt_slip"]', 4000, 4.0, 15, 12, '{"locationGisCapable":true,"processingCapacity_tph":50}'],
    ['AGR-SILO-AERATE', 'Grain silo aeration fan', 'GRAIN_HANDLING', '["GSI","Brock","Sukup"]', 180, '["fan_blade_imbalance","motor_capacitor_failure","bearing_seize","air_screen_plugging"]', 8000, 1.5, 15, 12, '{"locationGisCapable":true,"horsepower":15}'],
    ['AGR-BALER-ROUND', 'Round baler', 'HARVESTING', '["John Deere","Vermeer","New Holland"]', 30, '["net_wrap_feed_jam","pickup_tine_break","bale_chamber_roller_bearing_seize","density_chain_slip"]', 2000, 2.0, 8, 8, '{"locationGisCapable":true,"workingWidthM":1.5}'],
    ['AGR-CONV-AUGER', 'Grain auger / screw conveyor', 'GRAIN_HANDLING', '["Westfield","Brandt","Hutchinson"]', 90, '["flighting_edge_wear","hanger_bearing_failure","pto_shaft_u_joint_break","gearbox_oil_leak"]', 3000, 2.0, 10, 10, '{"locationGisCapable":true,"processingCapacity_tph":150}'],
    ['AGR-PLANTR-PREC', 'Precision row crop planter', 'PLANTING', '["John Deere","Kinze","Case IH"]', 30, '["seed_meter_vacuum_leak","double_disk_opener_wear","closing_wheel_bearing_seize","row_unit_down_force_air_leak"]', 2000, 3.0, 10, 8, '{"locationGisCapable":true,"workingWidthM":18}']
];

const parts = [
    ['AGR-HARV-CONCAVE', 'Combine Threshing Concave Section (Corn/Soy)', 'CONCAVE SECTION, THRESHING', 'John Deere', 'MECHANICAL', 'Combine Internals', 'EA', 400, 1200, 14, '{"crop":"Corn/Soy","type":"Large Wire"}', '[]', '["AGR-HARV-GRAIN"]', 'concave,threshing,combine,corn,soy'],
    ['AGR-HARV-SICKLE', 'Combine Cutter Bar Sickle Section Blade Set', 'BLADE SET, SICKLE SECTION', 'MacDon', 'MECHANICAL', 'Cutting Parts', 'BOX', 50, 150, 7, '{"quantity":25}', '[]', '["AGR-HARV-GRAIN"]', 'sickle,blade,cutter,bar,combine'],
    ['AGR-HARV-CHAIN', 'Combine Feeder House Chain (per meter)', 'CHAIN, FEEDER HOUSE', 'Rexnord', 'MECHANICAL', 'Chains', 'M', 40, 90, 7, '{"pitch":"#40"}', '["REXNORD-40-1R-10"]', '["AGR-HARV-GRAIN"]', 'chain,feeder,house,combine'],
    ['AGR-HARV-AUGER', 'Combine Header Cross Auger Flighting (0.5m Section)', 'AUGER FLIGHTING, 0.5M', 'Lundell', 'MECHANICAL', 'Auger Parts', 'EA', 100, 250, 14, '{"length_m":0.5,"type":"Bolt-On"}', '[]', '["AGR-HARV-GRAIN"]', 'auger,flighting,combine,header'],
    ['AGR-ELEV-BELT', 'Bucket Elevator Belt Rubber/Fabric Ply (per meter)', 'BELT, BUCKET ELEVATOR', 'Goodyear', 'MECHANICAL', 'Belting', 'M', 25, 80, 14, '{"type":"Rubber/Fabric"}', '[]', '["AGR-ELEV-BUCKET"]', 'belt,elevator,bucket,rubber'],
    ['AGR-BUCKET-POLY-5L', 'Elevator Polyethylene Bucket 5L Capacity Bolt-On', 'BUCKET, ELEVATOR, POLY', 'Tapco', 'MECHANICAL', 'Elevator Components', 'EA', 10, 30, 7, '{"capacity_l":5,"material":"Polyethylene"}', '[]', '["AGR-ELEV-BUCKET"]', 'bucket,elevator,poly,bolt,on'],
    ['AGR-SPRAY-NOZ', 'Sprayer TeeJet-style Flat Fan Nozzle Tip 110 Degree', 'NOZZLE TIP, FLAT FAN 110 DEG', 'TeeJet', 'CONSUMABLES', 'Sprayer Parts', 'BOX', 40, 100, 7, '{"angle_deg":110,"quantity":10}', '[]', '["AGR-SPRAYER-SP"]', 'nozzle,tip,sprayer,flat,fan'],
    ['AGR-SPRAY-VLV', 'Sprayer Boom Diaphragm Check Valve', 'VALVE, CHECK, DIAPHRAGM', 'Hypro', 'PNEUMATICS', 'Valves', 'EA', 8, 25, 5, '{"type":"Diaphragm Check"}', '[]', '["AGR-SPRAYER-SP"]', 'valve,check,diaphragm,sprayer'],
    ['AGR-PIVOT-SEAL', 'Center Pivot Drive Unit Gearbox Oil Seal Kit', 'SEAL KIT, PIVOT GEARBOX', 'Valley', 'SEALS', 'Gearbox Seals', 'SET', 50, 150, 7, '{"application":"Drive Unit Gearbox"}', '[]', '["AGR-IRRIG-CP"]', 'seal,kit,gearbox,pivot'],
    ['AGR-PIVOT-MTR', 'Center Pivot Tower Drive Motor', 'MOTOR, DRIVE, PIVOT TOWER', 'US Motors', 'ELECTRICAL', 'Motors', 'EA', 300, 800, 14, '{"application":"Tower Drive"}', '[]', '["AGR-IRRIG-CP"]', 'motor,drive,tower,pivot'],
    ['AGR-PIVOT-TYRE', 'Center Pivot Tyre 11L-15', 'TYRE, CENTER PIVOT, 11L-15', 'Firestone', 'MECHANICAL', 'Tires', 'EA', 80, 180, 7, '{"size":"11L-15"}', '[]', '["AGR-IRRIG-CP"]', 'tyre,tire,pivot,11l15'],
    ['AGR-PUMP-SEAL', 'Irrigation Pump Mechanical Seal', 'SEAL SET, MECHANICAL, IRRIGATION PUMP', 'John Crane', 'SEALS', 'Mechanical Seals', 'SET', 150, 400, 14, '{"application":"Irrigation Pump"}', '["PUMP-SEAL-MECH-175"]', '["AGR-PUMP-IRRIG"]', 'seal,mechanical,irrigation,pump'],
    ['AGR-PUMP-IMP', 'Irrigation Pump Impeller Stainless 316', 'IMPELLER, IRRIGATION PUMP, SS316', 'Cornell', 'MECHANICAL', 'Pump Components', 'EA', 200, 600, 21, '{"material":"Stainless Steel 316"}', '[]', '["AGR-PUMP-IRRIG"]', 'impeller,pump,irrigation,ss316'],
    ['AGR-DRYER-NOZ', 'Grain Dryer Burner Nozzle Set', 'NOZZLE SET, BURNER, GRAIN DRYER', 'GSI', 'MECHANICAL', 'Burner Components', 'SET', 60, 180, 14, '{"application":"Grain Dryer Burner"}', '[]', '["AGR-DRYER-GRAIN"]', 'nozzle,set,burner,dryer'],
    ['AGR-DRYER-BRG', 'Grain Dryer Combustion Blower Bearing', 'BEARING, BLOWER, COMBUSTION', 'SKF', 'BEARINGS', 'Ball Bearings', 'EA', 20, 80, 5, '{"application":"Combustion Blower"}', '["SKF-6205-2RS"]', '["AGR-DRYER-GRAIN"]', 'bearing,blower,dryer,combustion'],
    ['AGR-BALER-NET', 'Round Baler Net Wrap Roll 1.25m x 3000m', 'NET WRAP, ROUND BALER', 'Tama', 'CONSUMABLES', 'Baling Supplies', 'EA', 80, 180, 7, '{"width_m":1.25,"length_m":3000}', '[]', '["AGR-BALER-ROUND"]', 'net,wrap,roll,baler'],
    ['AGR-BALER-TINE', 'Round Baler Pickup Tine Set (20 pcs)', 'TINE SET, PICKUP, ROUND BALER', 'New Holland', 'MECHANICAL', 'Baler Components', 'SET', 40, 120, 7, '{"quantity":20}', '[]', '["AGR-BALER-ROUND"]', 'tine,set,pickup,baler'],
    ['AGR-PLANT-DISC', 'Precision Planter Seed Disc', 'SEED DISC, PRECISION PLANTER', 'Kinze', 'MECHANICAL', 'Planter Components', 'EA', 30, 80, 7, '{"cropType":"row_crop"}', '[]', '["AGR-PLANTR-PREC"]', 'seed,disc,planter,precision']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'AGR-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'AGR-%'`).get().c;

console.log(`✅ Seed Agro-Industry Complete`);
console.log(`   📦 AGR Equipment Types: ${totalE}`);
console.log(`   📦 AGR Master Parts: ${totalP}`);
db.close();
