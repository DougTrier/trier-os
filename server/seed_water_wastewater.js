// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Water & Wastewater Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['WWT-PUMP-VRT', 'Vertical turbine pump (raw water intake)', 'PUMPING', '["Flowserve","Sulzer","Xylem/Goulds"]', 90, '["bowl_wear_ring_erosion","lineshaft_bearing_failure","column_pipe_corrosion","motor_thrust_bearing_overload"]', 8000, 5.0, 20, 12, '{"locationGisCapable":true,"flowRate_m3h":2500,"powerKW":500}'],
    ['WWT-PUMP-SCREW', 'Archimedes screw pump (influent lift)', 'PUMPING', '["Evoqua","Spaans Babcock","Lakeside"]', 180, '["lower_bearing_seal_failure","trough_grout_erosion","drive_belt_slip","gearbox_oil_leak"]', 15000, 4.0, 30, 24, '{"locationGisCapable":true,"flowRate_m3h":4000,"powerKW":150}'],
    ['WWT-BLWR-TURBO', 'Turbo blower / high-speed centrifugal (aeration)', 'AERATION', '["Sulzer","Neuros","APG-Neuros","Howden"]', 60, '["impeller_fouling","air_bearing_overtemperature","inlet_filter_clog","motor_inverter_fault"]', 12000, 3.0, 15, 24, '{"locationGisCapable":true,"powerKW":300,"pressureClass_bar":1.2}'],
    ['WWT-BLWR-LOBE', 'Rotary lobe (positive displacement) blower', 'AERATION', '["Aerzen","Gardner Denver","Kaeser"]', 90, '["timing_gear_wear","lobe_clearance_loss","drive_belt_snap","discharge_silencer_clog"]', 8000, 4.0, 20, 12, '{"locationGisCapable":true,"powerKW":110,"pressureClass_bar":1.0}'],
    ['WWT-SCREEN-BAND', 'Bandscreen / traveling water screen', 'SCREENING', '["Evoqua","Huber","Andritz"]', 30, '["panel_mesh_blinding","drive_shaft_bearing_seize","spray_nozzle_clog","panel_frame_corrosion"]', 4000, 3.0, 15, 12, '{"locationGisCapable":true,"flowRate_m3h":5000}'],
    ['WWT-GRIT-CLASS', 'Grit classifier / dewatering screw', 'GRIT_REMOVAL', '["Huber","Evoqua","Smith & Loveless"]', 90, '["screw_flight_abrasion","lower_bearing_failure","trough_liner_wear","drive_motor_overload"]', 5000, 4.0, 15, 12, '{"locationGisCapable":true,"powerKW":15}'],
    ['WWT-CLARI-MECH', 'Clarifier mechanism (sludge collector/rake)', 'CLARIFICATION', '["Evoqua","Ovivo","WesTech"]', 180, '["rake_arm_torque_overload","scum_skimmer_seal_wear","effluent_weir_clogging","drive_gearbox_oil_leak"]', 20000, 8.0, 30, 24, '{"locationGisCapable":true,"flowRate_m3h":3000}'],
    ['WWT-FILT-MEMB', 'Membrane bioreactor (MBR) module rack', 'FILTRATION', '["Suez/Zenon","Koch Membrane Systems","Kubota"]', 90, '["membrane_fouling_irreversible","permeate_pump_seal_leak","aeration_diffuser_clog","integrity_test_breach"]', 6000, 6.0, 10, 12, '{"locationGisCapable":true,"membraneArea_m2":1500}'],
    ['WWT-UV-DISINFECT', 'UV disinfection system (channel type)', 'DISINFECTION', '["TrojanUV","Xylem/Wedeco","Calgon Carbon"]', 30, '["lamp_intensity_low","quartz_sleeve_fouling","wiper_mechanism_jam","ballast_failure"]', 8000, 2.0, 15, 12, '{"locationGisCapable":true,"uvDoseTarget_mJcm2":30}'],
    ['WWT-DEWATR-CENT', 'Centrifuge (sludge dewatering)', 'SLUDGE', '["Alfa Laval","GEA","Andritz","Flottweg"]', 60, '["scroll_conveyor_wear","bearing_vibration_high","polymer_injection_nozzle_clog","bowl_scaling"]', 6000, 8.0, 20, 24, '{"locationGisCapable":true,"flowRate_m3h":50,"powerKW":75}'],
    ['WWT-DEWATR-BELT', 'Belt filter press', 'SLUDGE', '["Andritz","Evoqua","Charter Machine"]', 90, '["filter_belt_tear","tracking_sensor_fault","roller_bearing_seize","wash_water_nozzle_plug"]', 5000, 6.0, 20, 15, '{"locationGisCapable":true,"flowRate_m3h":40,"powerKW":15}'],
    ['WWT-DIGESTER', 'Anaerobic digester / biogas system', 'SLUDGE', '["Ovivo","WesTech","Evoqua"]', 180, '["gas_membrane_cover_leak","mixing_pump_clog","heat_exchanger_scaling","flame_arrester_blockage"]', 15000, 12.0, 40, 24, '{"locationGisCapable":true,"pressureClass_bar":0.5}']
];

const parts = [
    ['WWT-VTP-WEAR-RING', 'VTP Bowl Wear Ring Bronze/Ceramic', 'WEAR RING, BOWL, VTP', 'Flowserve', 'MECHANICAL', 'Pump Components', 'EA', 150, 600, 21, '{"application":"Vertical Turbine Pump","material":"Bronze/Ceramic"}', '[]', '["WWT-PUMP-VRT"]', 'wear,ring,bowl,vtp,pump'],
    ['WWT-VTP-BRG-LS', 'VTP Lineshaft Enclosing Tube Bearing Cutless Rubber', 'BEARING, LINESHAFT, CUTLESS RUBBER', 'Xylem', 'BEARINGS', 'Pump Bearings', 'EA', 40, 120, 14, '{"material":"Cutless Rubber"}', '[]', '["WWT-PUMP-VRT"]', 'bearing,lineshaft,rubber,vtp'],
    ['WWT-BLWR-FLTR', 'Turbo Blower Air Filter Element', 'FILTER, AIR, TURBO BLOWER', 'Sulzer', 'FILTERS', 'Air Filters', 'EA', 80, 250, 7, '{"application":"Turbo Blower"}', '[]', '["WWT-BLWR-TURBO"]', 'filter,air,blower,turbo'],
    ['WWT-LOBE-GEAR-SET', 'Rotary Lobe Blower Timing Gear Set', 'GEAR SET, TIMING, ROTARY LOBE', 'Aerzen', 'MECHANICAL', 'Gears', 'SET', 400, 1200, 21, '{"application":"Rotary Lobe Blower"}', '[]', '["WWT-BLWR-LOBE"]', 'gear,set,timing,lobe,blower'],
    ['WWT-BAND-PANEL', 'Bandscreen Panel Mesh Section Stainless Wedge Wire', 'PANEL, MESH, BANDSCREEN', 'Evoqua', 'MECHANICAL', 'Screen Components', 'EA', 200, 600, 21, '{"material":"Stainless Wedge Wire"}', '[]', '["WWT-SCREEN-BAND"]', 'panel,mesh,screen,bandscreen'],
    ['WWT-BAND-NOZZLE', 'Bandscreen Spray Nozzle Set (10-pack)', 'NOZZLE SET, SPRAY, BANDSCREEN', 'Spraying Systems Co.', 'MECHANICAL', 'Spray Nozzles', 'BOX', 30, 90, 7, '{"quantity":10}', '[]', '["WWT-SCREEN-BAND"]', 'nozzle,spray,bandscreen,set'],
    ['WWT-CLARI-PIN', 'Clarifier Rake Arm Torque Pin (Shear Pin) Stainless', 'PIN, TORQUE, SHEAR, CLARIFIER', 'Ovivo', 'MECHANICAL', 'Safety Devices', 'BOX', 5, 20, 7, '{"quantity":10,"material":"Stainless Steel"}', '[]', '["WWT-CLARI-MECH"]', 'pin,torque,shear,clarifier'],
    ['WWT-CLARI-SEAL', 'Clarifier Drive Gearbox Oil Seal Kit', 'SEAL KIT, GEARBOX, CLARIFIER', 'WesTech', 'SEALS', 'Gearbox Seals', 'SET', 50, 200, 14, '{"application":"Clarifier Drive"}', '[]', '["WWT-CLARI-MECH"]', 'seal,kit,gearbox,clarifier'],
    ['WWT-MBR-MOD-HF', 'MBR Hollow-Fiber Membrane Module', 'MEMBRANE MODULE, MBR, HOLLOW-FIBER', 'Suez/Zenon', 'FILTERS', 'Membranes', 'EA', 800, 2500, 30, '{"type":"Hollow-Fiber","application":"MBR"}', '[]', '["WWT-FILT-MEMB"]', 'membrane,module,mbr,hollow,fiber'],
    ['WWT-MBR-DIFF', 'MBR PTFE Membrane Cassette Diffuser', 'DIFFUSER, CASSETTE, MBR, PTFE', 'Koch', 'MECHANICAL', 'Aeration', 'EA', 100, 300, 14, '{"material":"PTFE"}', '[]', '["WWT-FILT-MEMB"]', 'diffuser,cassette,mbr,ptfe'],
    ['WWT-UV-LAMP', 'UV Amalgam Lamp', 'LAMP, UV, AMALGAM', 'TrojanUV', 'CONSUMABLES', 'UV Components', 'EA', 200, 600, 14, '{"lifetime_hrs":12000,"type":"Amalgam"}', '[]', '["WWT-UV-DISINFECT"]', 'lamp,uv,amalgam,disinfection'],
    ['WWT-UV-SLEEVE', 'UV Quartz Sleeve', 'SLEEVE, QUARTZ, UV', 'TrojanUV', 'CONSUMABLES', 'UV Components', 'EA', 80, 200, 14, '{"material":"Quartz"}', '[]', '["WWT-UV-DISINFECT"]', 'sleeve,quartz,uv'],
    ['WWT-CENT-REPAIR', 'Centrifuge Scroll Conveyor Hard-Face Repair Kit', 'REPAIR KIT, HARD-FACE, SCROLL CONVEYOR', 'Alfa Laval', 'MECHANICAL', 'Centrifuge Parts', 'SET', 1500, 4000, 45, '{"application":"Scroll Conveyor"}', '[]', '["WWT-DEWATR-CENT"]', 'repair,kit,hard,face,centrifuge'],
    ['WWT-CENT-WEIGHT', 'Centrifuge Bowl Balance Weight Set', 'WEIGHT SET, BALANCE, CENTRIFUGE BOWL', 'Andritz', 'MECHANICAL', 'Centrifuge Parts', 'SET', 300, 900, 14, '{"application":"Bowl Balance"}', '[]', '["WWT-DEWATR-CENT"]', 'weight,set,balance,centrifuge'],
    ['WWT-BELT-FLTR-SYN', 'Belt Press Filter Belt Synthetic Woven (per meter)', 'BELT, FILTER, SYNTHETIC, WOVEN', 'Sefar', 'FILTERS', 'Filter Belts', 'M', 30, 90, 21, '{"material":"Synthetic Woven"}', '[]', '["WWT-DEWATR-BELT"]', 'belt,filter,synthetic,woven'],
    ['WWT-BELT-BRG-01', 'Belt Press Roller Bearing', 'BEARING, ROLLER, BELT PRESS', 'SKF', 'BEARINGS', 'Ball Bearings', 'EA', 20, 100, 7, '{"application":"Belt Press Roller"}', '["SKF-6205-2RS"]', '["WWT-DEWATR-BELT"]', 'bearing,roller,belt,press'],
    ['WWT-DIG-PATCH', 'Digester Gas Membrane Cover Patch Kit', 'PATCH KIT, MEMBRANE COVER, DIGESTER', 'Ovivo', 'CONSUMABLES', 'Repair Kits', 'SET', 200, 600, 14, '{"application":"Gas Membrane"}', '[]', '["WWT-DIGESTER"]', 'patch,kit,membrane,cover,digester'],
    ['WWT-POLY-DIAPH', 'Polymer Dosing Pump Diaphragm', 'DIAPHRAGM, DOSING PUMP, POLYMER', 'Prominent', 'PNEUMATICS', 'Pump Diaphragms', 'EA', 40, 120, 7, '{"application":"Polymer Dosing"}', '[]', '["WWT-GRIT-CLASS","WWT-DEWATR-CENT","WWT-DEWATR-BELT"]', 'diaphragm,dosing,pump,polymer']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'WWT-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'WWT-%'`).get().c;

console.log(`✅ Seed Water & Wastewater Complete`);
console.log(`   📦 WWT Equipment Types: ${totalE}`);
console.log(`   📦 WWT Master Parts: ${totalP}`);
db.close();
