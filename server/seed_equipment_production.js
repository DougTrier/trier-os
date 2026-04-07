// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Equipment — Deep Production Focus: every processing line type
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
// ── RAW MILK RECEIVING & STORAGE ─────────────────────────────────────
['RECEIVING_BAY','Milk Receiving Bay (Tanker Unload Station)','PRODUCTION','["Custom","Walker Stainless","Cherry-Burrell"]',90,'["receiving_pump_failure","hose_port_leak","air_eliminator","CIP_sprayball","sample_valve"]',15000,1.5,30,0,'{"includes":"pump,strainer,air_eliminator,sample_port,meter"}'],
['PLATE_CHILLER','Raw Milk Plate Chiller','PRODUCTION','["Alfa Laval","GEA","Mueller","APV"]',90,'["plate_fouling","gasket_leak","glycol_flow","temperature_overshoot"]',12000,2.0,25,18,'{"cools":"95°F to 38°F","medium":"glycol or city water"}'],
['DEAERATOR','De-Aerator / Vacuum Chamber','PRODUCTION','["Alfa Laval","GEA","SPX FLOW"]',90,'["vacuum_pump_failure","float_valve","sight_glass_leak","gasket_wear"]',10000,2.0,20,12,'{"removes":"entrained air from raw milk before processing"}'],
['INLINE_STRAINER','In-Line Milk Strainer/Filter','PRODUCTION','["Central States","Alfa Laval"]',30,'["screen_plugging","gasket_leak","bypass_valve"]',20000,0.5,20,0,null],
['FLOW_DIVERSION','Flow Diversion Device (FDD)','PRODUCTION','["Anderson","APV/SPX","Alfa Laval"]',30,'["failed_to_divert","stem_seal_leak","actuator_failure","seat_wear","micro_switch"]',8000,2.0,15,12,'{"3A_required":true,"PMO_regulated":true,"critical_food_safety":true}'],
['RECORDING_CHART','Recording Chart Recorder / Datalogger','PRODUCTION','["Anderson","Partlow/West","Honeywell","ABB"]',30,'["pen_failure","chart_drive","thermocouple_drift","ink_dry","power_supply"]',10000,0.5,15,12,'{"PMO_required":true,"note":"Circular chart recorders still required by PMO for HTST verification"}'],

// ── PASTEURIZATION VARIANTS ──────────────────────────────────────────
['HTST_REGEN','HTST Regeneration Section','PRODUCTION','["Alfa Laval","APV/SPX","GEA","Tetra Pak"]',30,'["plate_crack","gasket_blow_out","regeneration_loss","cross_contamination","pressure_differential"]',8000,3.0,20,18,'{"regen_efficiency":"90-95%","critical":"product-to-product heat recovery"}'],
['HTST_HEATING','HTST Heating Section (Hot Water Set)','PRODUCTION','["Alfa Laval","APV/SPX","GEA"]',30,'["steam_valve_failure","hot_water_pump","temperature_overshoot","PRV_failure","steam_trap"]',8000,3.0,20,18,'{"media":"hot water heated by steam"}'],
['HTST_COOLING','HTST Cooling Section','PRODUCTION','["Alfa Laval","APV/SPX","GEA"]',90,'["glycol_flow","plate_fouling","gasket_leak","temperature_undershoot"]',10000,2.0,20,18,null],
['HTST_TIMING_PUMP','HTST Timing/Metering Pump','PRODUCTION','["Waukesha","Fristam","APV"]',30,'["seal_failure","rotor_wear","speed_drift","VFD_fault","cavitation"]',6000,3.0,15,18,'{"PMO_sealed":true,"critical":"determines legal flow rate and hold time"}'],
['HTST_CONTROLS','HTST Control Panel & Safety Circuit','PRODUCTION','["Custom/OEM","Allen-Bradley","Siemens"]',365,'["safety_relay_failure","cut-in/cut-out_fault","recorder_interface","divert_logic","SLC_fault"]',10000,4.0,20,18,'{"PMO_sealed":true,"note":"Safety circuit sealed by regulatory authority. Critical food safety."}'],

// ── SEPARATION & CLARIFICATION ───────────────────────────────────────
['CLARIFIER','Milk Clarifier','PRODUCTION','["GEA Westfalia","Alfa Laval","DeLaval"]',21,'["bowl_vibration","sludge_discharge","feed_pump","disc_fouling","bearing_noise"]',7000,4.0,20,24,'{"removes":"somatic_cells,bacteria,sediment"}'],
['FAT_STANDARDIZER','Fat Standardization System (In-Line)','PRODUCTION','["GEA Westfalia","Alfa Laval"]',30,'["fat_sensor_calibration","modulating_valve","flow_meter_drift","PLC_communication"]',8000,3.0,15,18,'{"measures":"fat% in real-time, adjusts cream/skim ratio"}'],
['CREAM_SEPARATOR_LEG','Legacy Cream Separator (Belt-Drive)','PRODUCTION','["DeLaval","Westfalia (vintage)","Alfa Laval (1960s-80s)"]',21,'["belt_wear","bowl_vibration","brake_lining","seal_ring","oil_level","manual_discharge"]',10000,5.0,40,0,'{"note":"Belt-driven DeLaval/Westfalia from 1960s-1980s. Many still running. Parts machined locally."}'],

// ── HOMOGENIZATION ───────────────────────────────────────────────────
['HOMOGENIZER_2STAGE','Two-Stage Homogenizer','PRODUCTION','["GEA Niro Soavi","SPX FLOW/APV Gaulin","Tetra Pak"]',14,'["1st_stage_valve_seat","2nd_stage_valve","plunger_seal","crankshaft_bearing","oil_cooler_fouling"]',5000,6.0,15,18,'{"pressure":"2000/500 psi","note":"Two-stage standard for fluid milk"}'],
['HOMOGENIZER_ASEPTIC','Aseptic Homogenizer','PRODUCTION','["GEA Niro Soavi","Tetra Pak","SPX FLOW"]',14,'["sterile_barrier_seal","plunger_seal","valve_seat","steam_barrier","condensate_drain"]',4000,8.0,15,24,'{"note":"Maintains sterility downstream of UHT. Critical for ESL/aseptic products."}'],
['GAULIN_LEGACY','APV Gaulin Homogenizer (Legacy Pre-2000)','PRODUCTION','["APV Gaulin","Rannie","Manton-Gaulin"]',14,'["plunger_seal_wear","valve_seat_erosion","crankcase_bearing","oil_pump","pressure_gauge"]',7000,5.0,35,0,'{"note":"APV Gaulin 1000/2000/3000 series. Very common in plants from 1980s-2000s. Rebuild parts from Gaulin Parts Inc."}'],

// ── CHEESE PRODUCTION ────────────────────────────────────────────────
['CHEESE_TOWER','Cheddar Cheese Tower/Block Former','PRODUCTION','["Tetra Pak/Damrow","Stoelting","Johnson Industries"]',14,'["vacuum_pump","auger_drive","moisture_control","tower_jacket","hydraulic_press"]',5000,6.0,25,18,null],
['CHEESE_PRESS','Cheese Press (Horizontal/Vertical)','PRODUCTION','["Stoelting","Custom","Tetra Pak/Damrow"]',30,'["hydraulic_cylinder","plate_alignment","cloth_wear","pressure_gauge","drain_screen"]',10000,3.0,25,12,null],
['CHEESE_DRAIN_TABLE','Cheese Drain Table / Belt Drainer','PRODUCTION','["Stoelting","Custom","Scherping Systems"]',30,'["belt_tracking","drain_screen","agitator","sprocket_wear","bearing_failure"]',8000,3.0,20,12,null],
['CHEESE_WAXER','Cheese Waxing Machine','PRODUCTION','["Custom","Klöckner"]',90,'["wax_temperature","dip_mechanism","brush_wear","thermostat"]',12000,1.5,20,0,null],
['CHEESE_CUTTER','Cheese Cutting/Portioning Machine','PRODUCTION','["Marchant Schmidt","GEA","Thurne"]',30,'["wire_break","servo_fault","conveyor_belt","sensor_alignment"]',6000,2.0,15,12,null],
['CHEESE_SHREDDER','Cheese Shredding Machine','PRODUCTION','["Urschel","FAM","Marchant Schmidt"]',14,'["blade_dulling","bearing_failure","motor_overload","intake_roller","screen_wear"]',5000,2.0,12,12,null],
['BRINE_SYSTEM','Cheese Brine System','PRODUCTION','["Custom","Tetra Pak"]',30,'["salt_concentration","pH_probe","filter_pump","agitator","corrosion"]',10000,3.0,25,0,'{"note":"Brine tanks with salt dosing, circulation, and pH control. SS or lined concrete."}'],

// ── ICE CREAM & FROZEN ───────────────────────────────────────────────
['IC_MIX_PROCESSOR','Ice Cream Mix Processing System','PRODUCTION','["Tetra Pak","APV/SPX","GEA"]',14,'["pasteurizer_fouling","homogenizer_wear","aging_tank_agitator","ingredient_dosing"]',6000,5.0,20,18,null],
['IC_AGING_TANK','Ice Cream Mix Aging/Maturation Tank','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell"]',90,'["agitator_failure","jacket_leak","temperature_drift","level_probe"]',15000,2.0,25,12,'{"temp":"40°F","hold_time":"4-24 hours"}'],
['IC_FLAVOR_INJECTOR','Ice Cream Flavor/Color Injection System','PRODUCTION','["Tetra Pak","Custom"]',14,'["metering_pump","injection_valve","color_sensor","variegate_pump"]',5000,2.0,12,12,null],
['IC_NOVELTY_LINE','Ice Cream Novelty/Stick Line','PRODUCTION','["Tetra Pak/Hoyer","Gram/Carpigiani","APV"]',7,'["mold_alignment","stick_inserter","brine_level","chocolate_enrober","wrapping"]',3500,6.0,15,18,null],
['IC_EXTRUSION','Ice Cream Extrusion/Cutting Line','PRODUCTION','["Tetra Pak","Gram","Rheon"]',7,'["die_wear","cutting_wire","conveyor_sync","hardening_interface"]',4000,4.0,15,18,null],
['HARDENING_TUNNEL','Blast Hardening Tunnel/Spiral Freezer','PRODUCTION','["GEA","JBT/FMC","Linde","IQF Systems"]',30,'["evaporator_coil","fan_motor","belt_tracking","ammonia_level","defrost_cycle"]',6000,4.0,20,18,'{"temp":"-30 to -40°F"}'],

// ── YOGURT & CULTURED ────────────────────────────────────────────────
['YOGURT_INCUBATOR','Yogurt Incubation Tank','PRODUCTION','["Walker Stainless","DCI","Tetra Pak"]',30,'["temperature_control","pH_probe","agitator_speed","jacket_valve","CIP_coverage"]',12000,2.0,25,12,'{"temp":"108-115°F","hold":"4-8 hours"}'],
['YOGURT_COOLER','Yogurt Post-Incubation Cooler','PRODUCTION','["Alfa Laval","GEA","SPX FLOW"]',30,'["plate_fouling","gasket","glycol_flow","product_viscosity_challenge"]',10000,2.0,20,18,null],
['FRUIT_PREP','Fruit Prep / Ingredient Blending System','PRODUCTION','["Tetra Pak","SPX FLOW","custom"]',14,'["pump_seal","mixing_valve","strainer_screen","dosing_accuracy","CIP"]',6000,3.0,15,12,null],
['CULTURE_DOSING','Culture Dosing/Inoculation System','PRODUCTION','["Chr. Hansen","DSM","Tetra Pak"]',14,'["metering_pump","temperature","contamination_risk","tubing_wear","aseptic_connection"]',5000,2.0,10,12,'{"critical":"food_safety","aseptic":true}'],
['SOUR_CREAM_LINE','Sour Cream Processing Line','PRODUCTION','["Tetra Pak","SPX FLOW"]',14,'["pasteurizer","culture_dosing","incubation_tank","SSHE_cooling","filler_interface"]',5000,5.0,20,18,null],

// ── BUTTER & SPREADS ─────────────────────────────────────────────────
['BUTTER_SILO','Butter Silo/Hopper','PRODUCTION','["GEA","SPX FLOW","Custom"]',90,'["auger_drive","level_sensor","bridge_over","temperature"]',12000,2.0,25,12,null],
['BUTTER_PRINTER','Butter Printer/Packaging Machine','PRODUCTION','["Benhil","GEA","SIG"]',7,'["forming_mold","foil_feed","cutter","wrapper_seal","weight_control"]',4000,3.0,15,12,null],
['BUTTER_REWORKER','Butter Rework/Reblending System','PRODUCTION','["GEA","Custom"]',30,'["auger_wear","hopper_bridge","mixer_motor","temperature"]',8000,2.0,20,12,null],

// ── POWDER & EVAPORATION DETAILS ─────────────────────────────────────
['MVR_EVAPORATOR','MVR (Mechanical Vapor Recompression) Evaporator','PRODUCTION','["GEA","SPX FLOW","Alfa Laval"]',30,'["compressor_bearing","tube_fouling","vacuum_leak","condensate_pump","distribution_plate"]',5000,8.0,25,24,'{"energy":"80% less steam than conventional","capacity":"10,000-200,000 lbs/hr water removal"}'],
['CRYSTALLIZER','Lactose Crystallizer','PRODUCTION','["GEA","SPX FLOW"]',30,'["agitator_drive","jacket_fouling","crystal_size_control","temperature_profile","seed_dosing"]',6000,4.0,20,18,null],
['FLUID_BED_DRYER','Fluidized Bed Dryer/Cooler (Powder)','PRODUCTION','["GEA Niro","SPX FLOW","Bepex"]',30,'["air_heater","fluidization_plate","bag_filter","exhaust_fan","temperature_control"]',6000,4.0,20,18,'{"dries":"powder from 6% to 3-4% moisture"}'],
['POWDER_SIFTER','Powder Sifter/Screener','PRODUCTION','["Kason","Russell Finex","Sweco"]',30,'["screen_wear","vibration_motor","seal_failure","blinding","frame_crack"]',8000,2.0,15,12,null],
['POWDER_BAGGING','Powder Bagging Machine (25kg/50lb)','PRODUCTION','["Haver & Boecker","Premier Tech","National Bulk Equipment"]',14,'["fill_auger","scale_calibration","bag_clamp","sealer","dust_collection"]',5000,3.0,15,12,null],
['POWDER_SILO','Powder Storage Silo','PRODUCTION','["Custom","Walker","Schenck"]',365,'["level_sensor","discharge_valve","vibrator","bridging","humidity"]',20000,1.5,30,0,null],

// ── MEMBRANE & FILTRATION DETAILS ────────────────────────────────────
['UF_SYSTEM','Ultrafiltration System','PRODUCTION','["Koch Membrane","GEA","Pall Corp","Alfa Laval"]',30,'["membrane_fouling","pump_seal","CIP_frequency","permeate_quality","TMP_rise"]',5000,4.0,12,12,'{"pore":"0.01-0.1 micron","concentrates":"protein"}'],
['NF_SYSTEM','Nanofiltration System','PRODUCTION','["Koch Membrane","GEA","Dow/DuPont"]',30,'["membrane_fouling","high_pressure_pump","salt_rejection","CIP","pre-filter"]',5000,4.0,10,12,'{"demineralizes_whey":true}'],
['CERAMIC_FILTER','Ceramic Cross-Flow Filter','PRODUCTION','["Pall Corp","GEA","Veolia"]',30,'["membrane_cracking","seal_failure","backflush_valve","flow_control"]',7000,4.0,15,18,'{"advantage":"chemical_resistant,long_life,steam_sterilizable"}'],
];

const tx = db.transaction(() => { for (const e of equipment) ins.run(...e); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const prod = db.prepare("SELECT COUNT(*) as c FROM MasterEquipment WHERE Category='PRODUCTION'").get().c;
console.log(`\n🏭 Total Equipment: ${total} (Production: ${prod})`);
db.close();
