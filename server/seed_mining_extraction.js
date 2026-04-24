// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Mining & Extraction Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['MIN-DRILL-DTH', 'Down-the-hole drill rig', 'DRILLING', '["Epiroc","Sandvik","CAT"]', 30, '["dth_hammer_seal_failure","drill_bit_wear","compressor_unloader_fault","track_pad_shear"]', 2000, 4.0, 15, 12, '{"locationGisCapable":true,"typicalBenchElevation":"surface_bench"}'],
    ['MIN-DRILL-JUMBO', 'Jumbo face drill (underground)', 'DRILLING', '["Epiroc","Sandvik","Komatsu"]', 30, '["hydraulic_boom_drift","drifter_seal_leak","water_flush_blockage","feed_cable_snap"]', 1500, 6.0, 10, 12, '{"locationGisCapable":true,"typicalDepth_m":-500}'],
    ['MIN-HAUL-RIGID', 'Rigid-frame haul truck 150t+', 'HAULAGE', '["CAT","Komatsu","Hitachi","Liebherr"]', 14, '["wheel_motor_overheat","suspension_strut_leak","dynamic_brake_grid_fault","tire_blowout"]', 2500, 5.0, 15, 24, '{"locationGisCapable":true,"typicalBenchElevation":"surface_bench"}'],
    ['MIN-HAUL-ARTIC', 'Articulated dump truck', 'HAULAGE', '["Volvo","CAT","Bell"]', 14, '["articulation_joint_wear","driveline_u_joint_failure","hydraulic_dump_cylinder_leak","transmission_clutch_slip"]', 3000, 4.0, 12, 12, '{"locationGisCapable":true,"typicalDepth_m":-200}'],
    ['MIN-LONG-SHEAR', 'Longwall shearer', 'EXTRACTION', '["Joy Global/Komatsu","CAT"]', 60, '["cutting_drum_pick_loss","haulage_chain_snap","ranging_arm_gearbox_failure","water_spray_clog"]', 1000, 8.0, 10, 12, '{"locationGisCapable":true,"typicalDepth_m":-800}'],
    ['MIN-CONV-TRIPPED', 'Overland belt conveyor', 'CONVEYING', '["Continental","FLSmidth","Metso"]', 30, '["idler_bearing_seize","belt_tear","drive_pulley_lagging_wear","splice_failure"]', 5000, 3.0, 25, 24, '{"locationGisCapable":true,"typicalBenchElevation":"surface_route"}'],
    ['MIN-SUMP-PUMP', 'Centrifugal sump pump', 'DEWATERING', '["Weir Minerals","Flygt","KSB"]', 60, '["impeller_abrasion_wear","mechanical_seal_leak","volute_liner_wear","motor_winding_short"]', 4000, 2.0, 10, 12, '{"locationGisCapable":false,"typicalDepth_m":-1000}'],
    ['MIN-FAN-AXI', 'Axial-flow ventilation fan', 'VENTILATION', '["Howden","TLT-Turbo","Zitrón"]', 90, '["blade_pitch_mechanism_jam","main_shaft_bearing_failure","stator_vane_corrosion","vibration_trip"]', 8000, 6.0, 25, 24, '{"locationGisCapable":false,"typicalDepth_m":-100}'],
    ['MIN-REFUGE-CH', 'Refuge chamber (underground)', 'SAFETY', '["MineARC","Dräger"]', 180, '["co2_scrubber_depletion","compressed_air_cylinder_leak","door_seal_damage","battery_backup_failure"]', 15000, 1.0, 15, 24, '{"locationGisCapable":true,"typicalDepth_m":-600}'],
    ['MIN-BLASTHOLE-ROT', 'Rotary blast-hole drill', 'DRILLING', '["Epiroc","Sandvik","CAT"]', 30, '["rotary_head_gearbox_wear","pull_down_chain_break","compressor_oil_cooler_leak","leveling_jack_failure"]', 2500, 5.0, 15, 12, '{"locationGisCapable":true,"typicalBenchElevation":"surface_bench"}'],
    ['MIN-SCREEN-VIB', 'Vibrating screen (ore sizing)', 'PROCESSING', '["Metso","Sandvik","FLSmidth"]', 60, '["screen_deck_blinding","exciter_mechanism_bearing_failure","isolation_spring_break","side_plate_crack"]', 4000, 4.0, 15, 12, '{"locationGisCapable":false,"typicalBenchElevation":"surface_plant"}'],
    ['MIN-LOAD-LHD', 'LHD (load-haul-dump)', 'HAULAGE', '["Epiroc","Sandvik","CAT"]', 14, '["bucket_lip_wear","boom_lift_cylinder_leak","torque_converter_overheat","cable_reel_jam"]', 2000, 5.0, 10, 12, '{"locationGisCapable":true,"typicalDepth_m":-700}']
];

const parts = [
    // DTH hammers and drill bits (3 sizes)
    ['MIN-DTH-BIT-89', 'DTH Drill Bit 89mm Carbide Button', 'DRILL BIT, DTH, 89MM', 'Sandvik', 'TOOLING', 'Drill Bits', 'EA', 300, 600, 7, '{"diameter_mm":89,"material":"Tungsten Carbide"}', '[]', '["MIN-DRILL-DTH"]', 'drill,bit,dth,89mm'],
    ['MIN-DTH-BIT-115', 'DTH Drill Bit 115mm Carbide Button', 'DRILL BIT, DTH, 115MM', 'Sandvik', 'TOOLING', 'Drill Bits', 'EA', 450, 850, 7, '{"diameter_mm":115,"material":"Tungsten Carbide"}', '[]', '["MIN-DRILL-DTH"]', 'drill,bit,dth,115mm'],
    ['MIN-DTH-BIT-165', 'DTH Drill Bit 165mm Carbide Button', 'DRILL BIT, DTH, 165MM', 'Epiroc', 'TOOLING', 'Drill Bits', 'EA', 800, 1500, 14, '{"diameter_mm":165,"material":"Tungsten Carbide"}', '[]', '["MIN-DRILL-DTH","MIN-BLASTHOLE-ROT"]', 'drill,bit,dth,165mm'],

    // Roto-percussive drill rods and couplings
    ['MIN-ROD-RP-T38', 'Roto-Percussive Drill Rod T38 Thread 3m', 'DRILL ROD, T38, 3M', 'Epiroc', 'TOOLING', 'Drill Rods', 'EA', 200, 450, 10, '{"thread":"T38","length_m":3}', '[]', '["MIN-DRILL-JUMBO"]', 'drill,rod,t38'],
    ['MIN-CPL-RP-T38', 'Roto-Percussive Coupling Sleeve T38', 'COUPLING, DRILL ROD, T38', 'Epiroc', 'TOOLING', 'Couplings', 'EA', 50, 120, 5, '{"thread":"T38"}', '[]', '["MIN-DRILL-JUMBO"]', 'coupling,drill,rod,t38'],

    // Rock bolts
    ['MIN-BOLT-SPLIT-39', 'Split-Set Rock Bolt 39mm x 1.5m', 'ROCK BOLT, SPLIT-SET, 39MMX1.5M', 'Minova', 'CONSUMABLES', 'Ground Support', 'EA', 15, 35, 14, '{"type":"Split-Set","diameter_mm":39,"length_m":1.5}', '[]', '["MIN-DRILL-JUMBO"]', 'rock,bolt,split,set,support'],
    ['MIN-BOLT-RESIN-20', 'Resin-Grouted Rock Bolt 20mm x 2m', 'ROCK BOLT, RESIN, 20MMX2M', 'DSI Underground', 'CONSUMABLES', 'Ground Support', 'EA', 25, 55, 14, '{"type":"Resin-Grouted","diameter_mm":20,"length_m":2}', '[]', '["MIN-DRILL-JUMBO"]', 'rock,bolt,resin,support'],

    // Shotcrete accelerator
    ['MIN-SHOT-NOZZLE-01', 'Shotcrete Accelerator Dosing Nozzle', 'NOZZLE, SHOTCRETE DOSING', 'Normet', 'CONSUMABLES', 'Spraying', 'EA', 120, 280, 7, '{"type":"Accelerator Dosing"}', '[]', '["MIN-DRILL-JUMBO"]', 'shotcrete,nozzle,dosing'],

    // Conveyor belt idler
    ['MIN-IDLER-CARRY-600', 'Conveyor Carrying Idler Roller 600mm BW', 'IDLER, CARRYING, 600MM BW', 'PROK', 'MECHANICAL', 'Conveyor Components', 'EA', 80, 200, 10, '{"belt_width_mm":600,"type":"Carrying"}', '[]', '["MIN-CONV-TRIPPED"]', 'idler,conveyor,carrying,roller'],
    ['MIN-IDLER-RETURN-600', 'Conveyor Return Idler Roller 600mm BW', 'IDLER, RETURN, 600MM BW', 'PROK', 'MECHANICAL', 'Conveyor Components', 'EA', 70, 180, 10, '{"belt_width_mm":600,"type":"Return"}', '[]', '["MIN-CONV-TRIPPED"]', 'idler,conveyor,return,roller'],

    // Belt splice fastener set
    ['MIN-BELT-SPLICE-FLEX', 'Mechanical Belt Splice Fastener Set', 'SPLICE SET, MECHANICAL, BELT', 'Flexco', 'MECHANICAL', 'Conveyor Components', 'SET', 250, 600, 5, '{"type":"Mechanical Fastener"}', '[]', '["MIN-CONV-TRIPPED"]', 'splice,belt,fastener,flexco'],

    // Haul truck brake pad set
    ['MIN-BRAKE-PAD-HT150', 'Haul Truck Brake Pad Set 150t+', 'BRAKE PAD SET, HAUL TRUCK', 'CAT', 'MECHANICAL', 'Brakes', 'SET', 800, 2000, 14, '{"vehicle_class":"150t+"}', '[]', '["MIN-HAUL-RIGID"]', 'brake,pad,set,truck'],

    // Haul truck tire
    ['MIN-TIRE-27R49', 'Haul Truck Tire 27.00R49 Radial', 'TIRE, HAUL TRUCK, 27.00R49', 'Michelin', 'MECHANICAL', 'Tires', 'EA', 18000, 35000, 60, '{"size":"27.00R49","type":"Radial"}', '[]', '["MIN-HAUL-RIGID"]', 'tire,haul,truck,27r49'],

    // Mud pump liner and piston set
    ['MIN-MUD-LINER-PISTON', 'Mud Pump Ceramic Liner and Piston Set 150mm', 'LINER/PISTON SET, MUD PUMP, 150MM', 'Weir Minerals', 'MECHANICAL', 'Pump Components', 'SET', 1800, 4000, 21, '{"diameter_mm":150,"material":"Ceramic/Rubber"}', '[]', '["MIN-SUMP-PUMP"]', 'liner,piston,mud,pump,set'],

    // LHD bucket cutting edge
    ['MIN-LHD-EDGE-3M', 'LHD Bucket Bolt-On Cutting Edge 3m', 'CUTTING EDGE, LHD, 3M, BOLT-ON', 'Sandvik', 'MECHANICAL', 'Wear Parts', 'EA', 1200, 2800, 21, '{"width_m":3,"type":"Bolt-On"}', '[]', '["MIN-LOAD-LHD"]', 'cutting,edge,lhd,bucket'],

    // Refuge chamber air cylinder
    ['MIN-REFUGE-AIR-CYL', 'Compressed Air Cylinder 300 Bar Breathing Quality', 'AIR CYLINDER, 300 BAR, BREATHING', 'MineARC', 'SAFETY', 'Life Support', 'EA', 500, 1200, 14, '{"pressure_bar":300,"gas":"Breathing Air"}', '[]', '["MIN-REFUGE-CH"]', 'cylinder,air,breathing,refuge'],

    // Ventilation fan bearing and seal
    ['MIN-FAN-BRG-22212', 'Ventilation Fan Spherical Roller Bearing 60x110x28mm', 'BEARING, SPHERICAL ROLLER, 22212 E', 'SKF', 'BEARINGS', 'Spherical Roller', 'EA', 100, 250, 7, '{"bore_mm":60,"od_mm":110}', '["SKF-22212-E"]', '["MIN-FAN-AXI"]', 'bearing,spherical,roller,fan'],
    ['MIN-FAN-SEAL-60', 'Mine Fan Shaft Lip Seal 60mm Viton', 'SEAL, SHAFT, 60MM, VITON', 'Garlock', 'SEALS', 'Lip Seals', 'EA', 30, 80, 7, '{"shaft_mm":60,"material":"Viton"}', '[]', '["MIN-FAN-AXI"]', 'seal,shaft,lip,fan,viton']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'MIN-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'MIN-%'`).get().c;

console.log(`✅ Seed Mining & Extraction Complete`);
console.log(`   📦 MIN Equipment Types: ${totalE}`);
console.log(`   📦 MIN Master Parts: ${totalP}`);
db.close();
