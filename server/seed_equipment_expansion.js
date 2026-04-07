// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Equipment Expansion: Legacy gear, tanks, facility, and missing categories
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
// ── PRODUCTION — Tanks & Vessels ─────────────────────────────────────
['RAW_MILK_SILO','Raw Milk Storage Silo (5000-50000 gal)','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell","Feldmeier"]',30,'["agitator_failure","level_sensor_drift","manway_gasket_leak","CIP_coverage","insulation_damage"]',15000,2.0,30,12,'{"capacity":"5000-50000 gal","material":"304/316L SS","insulated":true}'],
['BALANCE_TANK','Balance/Surge Tank','PRODUCTION','["Walker Stainless","DCI","APV"]',30,'["float_valve_failure","overflow","level_switch","CIP_coverage"]',20000,1.0,25,12,null],
['CIP_TANK','CIP Solution Tank (Caustic/Acid/Rinse)','UTILITY','["Sani-Matic","Walker Stainless","Central States"]',30,'["heating_element_failure","level_probe_drift","chemical_concentration","pump_seal","jacket_fouling"]',15000,2.0,25,12,'{"capacity":"100-1000 gal","heated":true}'],
['CREAM_TANK','Cream Storage/Aging Tank','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell"]',30,'["agitator_seal_leak","temperature_drift","CIP_coverage","manway_gasket"]',15000,2.0,30,12,null],
['MIX_TANK','Ingredient Mix/Blend Tank','PRODUCTION','["Walker Stainless","DCI","APV","Lee Industries"]',30,'["agitator_failure","jacket_leak","valve_sticking","level_probe"]',12000,2.0,25,12,'{"agitated":true,"jacketed":true}'],
['ASEPTIC_TANK','Aseptic Sterile Buffer Tank','PRODUCTION','["Tetra Pak","GEA","Alfa Laval"]',14,'["sterile_barrier_breach","pressure_loss","steam_seal_failure","valve_leak"]',8000,4.0,20,24,null],

// ── PRODUCTION — Heat Exchange ───────────────────────────────────────
['PLATE_COOLER','Plate Cooler (Pre-Cooling)','PRODUCTION','["Alfa Laval","GEA","Mueller","Cherry-Burrell"]',90,'["plate_fouling","gasket_failure","flow_imbalance","temperature_drift"]',12000,3.0,20,18,'{"type":"plate_frame","cooling":"glycol_or_city_water"}'],
['TUBULAR_HX','Tubular Heat Exchanger','PRODUCTION','["HRS Group","Alfa Laval","SPX FLOW"]',30,'["tube_fouling","shell_leak","gasket_failure","thermal_efficiency_loss"]',10000,4.0,20,18,null],
['SSHE','Scraped Surface Heat Exchanger','PRODUCTION','["SPX FLOW/Votator","Alfa Laval/Contherm","HRS Group"]',14,'["blade_wear","shaft_seal_leak","motor_overload","product_burn-on","drive_belt_wear"]',5000,5.0,15,18,'{"applications":"ice_cream,butter,margarine,viscous_products"}'],

// ── PRODUCTION — Specialty Dairy ─────────────────────────────────────
['COTTAGE_CHEESE_VAT','Cottage Cheese Making Vat','PRODUCTION','["Damrow/Tetra Pak","Stoelting","Custom"]',30,'["knife_frame_wear","jacket_leak","agitator_drive","drain_screen","valve_sticking"]',10000,3.0,25,12,null],
['CREAM_CHEESE_SYS','Cream Cheese Processing System','PRODUCTION','["SPX FLOW","Tetra Pak","GEA"]',14,'["separator_vibration","blending_consistency","heat_exchanger_fouling","packaging_interface"]',6000,6.0,20,18,null],
['WHEY_PROCESSOR','Whey Processing System','PRODUCTION','["GEA","Alfa Laval","SPX FLOW"]',14,'["separator_fouling","membrane_flux_decline","evaporator_scaling","crystallizer_buildup"]',6000,6.0,20,18,null],
['MILK_STANDARDIZER','In-Line Milk Standardizer','PRODUCTION','["GEA Westfalia","Alfa Laval"]',30,'["flow_meter_drift","fat_sensor_calibration","control_valve_response","separator_balance"]',8000,3.0,15,18,null],
['BACTOFUGE','Bactofuge (Bacteria Removal)','PRODUCTION','["Alfa Laval","GEA Westfalia"]',21,'["bowl_vibration","seal_ring_wear","feed_pump_failure","disc_fouling"]',7000,5.0,20,24,'{"rpm":"10000+","removes":"bacteria,spores"}'],
['CONTINUOUS_FREEZER','Continuous Ice Cream Freezer','PRODUCTION','["Tetra Pak/Hoyer","APV Crepaco","Gram/Carpigiani"]',14,'["dasher_bearing","scraper_blade_wear","refrigerant_leak","overrun_control","beater_motor"]',5000,6.0,15,18,'{"temp":"-5 to -7°C","overrun":"50-120%"}'],
['POWDER_BLENDER','Powder Blender/Ribbon Mixer','PRODUCTION','["Marion Mixers","Bepex","Scott Equipment"]',90,'["ribbon_wear","seal_failure","drive_chain","bearing_failure","discharge_gate"]',10000,3.0,20,12,null],
['MILK_RECEIVER','Milk Receiving Station/Dump Tank','PRODUCTION','["Walker Stainless","Cherry-Burrell","Mueller"]',90,'["pump_seal","float_valve","CIP_issue","strainer_screen","hose_port_damage"]',15000,1.5,25,12,null],

// ── PRODUCTION — Legacy Equipment ────────────────────────────────────
['LEGACY_VAT_PASTEURIZER','Legacy Vat Pasteurizer (Pre-1990)','PRODUCTION','["Cherry-Burrell","DeLaval","Creamery Package"]',30,'["jacket_fouling","agitator_failure","chart_recorder_pen","thermocouple_drift","valve_packing_leak"]',15000,3.0,40,0,'{"note":"Many still in service at small plants. Parts often custom-fabricated."}'],
['LEGACY_SEPARATOR','Legacy Centrifugal Separator (Pre-1995)','PRODUCTION','["DeLaval","Westfalia (pre-GEA)","Alfa Laval (vintage)"]',21,'["bowl_vibration","bearing_noise","seal_ring_wear","brake_pad","belt_drive_wear"]',8000,6.0,35,0,'{"note":"DeLaval separators from 1970s-80s still common. Bowl rebuilds available from specialty shops."}'],
['LEGACY_HOMOGENIZER','Legacy Homogenizer (Pre-2000)','PRODUCTION','["APV Gaulin","Rannie","Manton-Gaulin","Cherry-Burrell"]',14,'["plunger_seal_wear","valve_seat_erosion","crankshaft_bearing","oil_leak","pressure_gauge_failure"]',7000,6.0,30,0,'{"note":"APV Gaulin units from 1980s-90s very common. Rebuild kits still available."}'],
['LEGACY_FILLER','Legacy Filler/Packaging (Pre-2000)','PACKAGING','["Cherry-Burrell","Ex-Cell-O","Pure-Pak","Pur-Pak"]',7,'["fill_head_drip","carton_forming","chain_stretch","cam_follower_wear","pneumatic_cylinder_leak"]',5000,3.0,30,0,'{"note":"Ex-Cell-O and Pure-Pak fillers still in service. Parts increasingly scarce."}'],

// ── FACILITY — Buildings & Infrastructure ────────────────────────────
['WALK_IN_COOLER','Walk-In Cooler Unit','FACILITY','["Bohn/Heatcraft","Kramer Trenton","Larkin Coil"]',90,'["evaporator_fan_motor","defrost_heater","door_gasket","expansion_valve","refrigerant_leak"]',10000,3.0,15,12,'{"temp":"34-38°F"}'],
['WALK_IN_FREEZER','Walk-In Freezer Unit','FACILITY','["Bohn/Heatcraft","Kramer Trenton","Larkin Coil"]',90,'["evaporator_fan_motor","defrost_heater","frost_buildup","door_gasket","compressor_failure"]',8000,4.0,15,12,'{"temp":"-10 to 0°F"}'],
['ROOF_TOP_UNIT','Rooftop HVAC Unit (RTU)','FACILITY','["Trane","Carrier","Lennox","York"]',90,'["compressor_failure","condenser_fan","economizer","belt_wear","refrigerant_leak"]',10000,3.0,15,12,null],
['EMERGENCY_GENERATOR','Emergency Generator (Diesel/Natural Gas)','FACILITY','["Caterpillar","Cummins","Kohler","Generac"]',180,'["battery_failure","coolant_leak","fuel_filter","transfer_switch","governor_fault"]',12000,4.0,25,24,'{"auto_start":true}'],
['UPS_SYSTEM','Uninterruptible Power Supply','FACILITY','["Eaton","APC/Schneider","Vertiv/Emerson"]',365,'["battery_degradation","fan_failure","capacitor_aging","bypass_fault"]',8000,2.0,10,24,null],
['FIRE_SUPPRESSION','Fire Suppression/Sprinkler System','FACILITY','["Viking","Tyco/JCI","Reliable"]',365,'["valve_corrosion","head_obstruction","pressure_switch","compressor_failure_dry_system"]',20000,2.0,30,12,null],
['ELECTRICAL_SWITCHGEAR','Main Electrical Switchgear/MCC','FACILITY','["Square D/Schneider","Eaton","Siemens","Allen-Bradley"]',365,'["breaker_trip","bus_bar_heat","contactor_failure","ground_fault","arc_flash"]',20000,6.0,30,24,null],
['TRUCK_SCALE','Truck Scale / Platform Scale','FACILITY','["Mettler Toledo","Rice Lake","Fairbanks"]',365,'["load_cell_drift","junction_box_moisture","indicator_failure","cable_damage"]',15000,2.0,25,12,null],
['FLOOR_SCALE','Floor/Platform Scale','FACILITY','["Mettler Toledo","Rice Lake","Ohaus"]',365,'["load_cell_failure","indicator_fault","calibration_drift"]',12000,1.0,15,12,null],
['TRENCH_DRAIN','Trench Drain System','FACILITY','["Zurn","Watts","ACO"]',365,'["grate_damage","slope_settlement","joint_leak","grease_buildup"]',25000,2.0,30,0,null],

// ── LAB — Additional Testing ─────────────────────────────────────────
['SOMATIC_COUNTER','Somatic Cell Counter','LAB','["FOSS","Bentley","DeLaval"]',30,'["laser_alignment","flow_cell_clog","reagent_viscosity","calibration_drift"]',6000,2.0,10,12,null],
['CRYOSCOPE','Cryoscope (Freezing Point)','LAB','["Advanced Instruments","FOSS"]',30,'["thermistor_drift","sample_chamber_contamination","stirrer_motor","calibration"]',8000,1.0,12,12,null],
['BABCOCK_CENTRIFUGE','Babcock Centrifuge (Fat Test)','LAB','["Gerber","IEC"]',365,'["motor_brush_wear","lid_switch","timer_fault","cup_carrier_crack"]',15000,1.0,25,0,'{"note":"Many in service 30+ years. Very simple mechanical design."}'],
['COLONY_COUNTER','Colony Counter','LAB','["Leica","Fisher","Reichert"]',365,'["magnifier_bulb","counter_mechanism","stage_light"]',15000,0.5,15,12,null],

// ── LOGISTICS — Additional ───────────────────────────────────────────
['PALLET_JACK_ELEC','Electric Pallet Jack/Walkie','LOGISTICS','["Toyota","Crown","Raymond","Yale"]',90,'["battery_degradation","hydraulic_seal","wheel_wear","contactor","switch_failure"]',6000,1.5,8,24,'{"capacity":"4500-6000 lbs"}'],
['REACH_TRUCK','Reach Truck','LOGISTICS','["Toyota","Crown","Raymond"]',90,'["mast_chain","hydraulic_leak","steer_motor","battery","contactor_failure"]',6000,3.0,10,36,null],
['ORDER_PICKER','Order Picker','LOGISTICS','["Crown","Raymond","Toyota"]',90,'["platform_limit_switch","hydraulic_seal","battery","safety_gate"]',6000,2.0,10,24,null],
['DOCK_SEAL','Dock Seal/Shelter','FACILITY','["Rite-Hite","Kelley","Serco"]',365,'["foam_compression","vinyl_tear","frame_damage","header_sag"]',15000,2.0,15,12,null],
['HVLS_FAN','High Volume Low Speed (HVLS) Ceiling Fan','FACILITY','["Big Ass Fans","Rite-Hite","MacroAir"]',365,'["motor_bearing","gearbox_noise","blade_balance","VFD_fault","safety_cable"]',12000,2.0,15,24,'{"diameter":"8-24 ft","airflow":"up to 400,000 CFM"}'],

// ── PACKAGING — Additional ───────────────────────────────────────────
['BAG_IN_BOX','Bag-in-Box Filler','PACKAGING','["Scholle IPN","DS Smith","Liqui-Box"]',7,'["fill_head_valve","bag_loading","fitment_sealer","date_coder","conveyor"]',4000,2.0,12,12,null],
['BLOW_MOLDER','Blow Molder (HDPE/PET Bottles)','PACKAGING','["Sidel","Krones","Graham Engineering"]',14,'["mold_cooling","parison_control","clamp_pressure","heater_band","trim_cutter"]',4000,6.0,15,18,null],
['CHECKWEIGHER','In-Line Checkweigher','PACKAGING','["Mettler Toledo","Ishida","OCS","Anritsu"]',30,'["load_cell_drift","belt_tracking","reject_mechanism","calibration"]',8000,1.0,12,12,null],

// ── UTILITY — Additional ────────────────────────────────────────────
['RECIP_COMPRESSOR','Reciprocating Air Compressor (Legacy)','UTILITY','["Ingersoll Rand","Quincy","Campbell Hausfeld"]',90,'["valve_plate_wear","piston_ring","head_gasket","unloader","belt_wear","intake_filter"]',6000,4.0,20,12,'{"note":"Older piston compressors still in service at many plants. Being replaced by rotary screw."}'],
['WATER_SOFTENER','Water Softener','UTILITY','["Culligan","Pentair","EcoWater","Kinetico"]',180,'["resin_exhaustion","brine_valve","timer_motor","distributor_tube","salt_bridge"]',10000,2.0,15,12,null],
['REVERSE_OSMOSIS','Reverse Osmosis Water System','UTILITY','["Hydranautics","Dow/DuPont","Pall","GE Water"]',30,'["membrane_fouling","high_pressure_pump","permeate_quality","pre-filter","chemical_dosing"]',5000,4.0,15,12,null],
['STEAM_CONDENSATE','Steam Condensate Return System','UTILITY','["Spirax Sarco","Armstrong","Watson McDaniel"]',90,'["condensate_pump_failure","float_trap","PRV_failure","flash_tank_corrosion"]',10000,3.0,20,12,null],
['GLYCOL_SYSTEM','Glycol Recirculation System','UTILITY','["Alfa Laval","GEA","Paul Mueller"]',90,'["pump_seal_leak","glycol_concentration","expansion_tank","heat_exchanger_fouling"]',10000,3.0,20,12,null],
];

const tx = db.transaction(() => { for (const e of equipment) ins.run(...e); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterEquipment GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏭 Equipment Types: ${total}`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
db.close();
