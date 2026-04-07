// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Equipment — Fluid Milk Focus: Fill gaps to 100% on separation, homogenization,
 * mixing/blending, tanks, and legacy equipment
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
// ── SEPARATION & CLARIFICATION — Fill to 100% ───────────────────────
['COLD_SEPARATOR','Cold Milk Separator (Unheated)','PRODUCTION','["GEA Westfalia","Alfa Laval"]',21,'["bowl_vibration","disc_fouling","feed_pump","seal_ring","bearing_noise","cold_product_viscosity"]',7000,5.0,20,24,'{"temp":"40-45°F","note":"Separates without heating. Used in raw milk plants and for cold-sep cream products. Higher energy use but preserves milk quality."}'],
['CREAM_RIPENING_TANK','Cream Ripening/Aging Tank','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell"]',90,'["agitator_failure","jacket_fouling","temperature_drift","pH_probe","CIP_coverage"]',15000,2.0,25,12,'{"temp":"45-50°F","hold":"12-24 hours","note":"Used for ripened cream butter process. Controlled acidification of cream before churning."}'],
['DESLUDGE_SEPARATOR','Self-Desludging Separator','PRODUCTION','["GEA Westfalia","Alfa Laval"]',21,'["discharge_valve","piston_ring","water_seal","bowl_vibration","sludge_detection"]',6000,5.0,20,24,'{"note":"Automatic partial/total discharge of sludge. Standard on modern clarifiers and separators. Timing controlled by turbidity sensor or timer."}'],
['SKIM_TANK','Skim Milk Storage Tank','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell","Mueller"]',90,'["agitator_failure","level_sensor","CIP_sprayball","gasket_leak","temperature_drift"]',15000,2.0,30,12,'{"note":"Stores separated skim milk before standardization or further processing."}'],

// ── HOMOGENIZATION — Fill to 100% ────────────────────────────────────
['LAB_HOMOGENIZER','Laboratory Homogenizer','LAB','["APV/SPX","GEA","Panda Plus"]',90,'["plunger_seal","valve_seat","pressure_gauge","sample_cup_gasket"]',10000,1.0,15,12,'{"pressure":"0-2500 psi","capacity":"10-100 ml","note":"Lab-scale for product development and quality testing. Simulates plant homogenizer effect."}'],
['HOMOGENIZER_SINGLE','Single-Stage Homogenizer','PRODUCTION','["GEA Niro Soavi","SPX FLOW","Tetra Pak"]',14,'["valve_seat_wear","plunger_seal","bearing_failure","pressure_gauge","oil_cooler"]',5500,5.0,15,18,'{"pressure":"1500-2500 psi","note":"Single-stage used for some cream products, ice cream mix, and flavored milks where two-stage is not required."}'],

// ── MIXING & BLENDING — Fill to 100% ────────────────────────────────
['HIGH_SHEAR_MIXER','High Shear In-Line Mixer','PRODUCTION','["SPX FLOW/Lightnin","Silverson","IKA","Admix"]',14,'["rotor_stator_wear","mechanical_seal","motor_overload","screen_damage","cavitation"]',5000,3.0,12,12,'{"note":"Dissolves powders into liquid. Critical for protein fortification, stabilizer blending, and reconstitution. 3600+ RPM."}'],
['POWDER_FUNNEL','Powder Induction/Funnel Hopper','PRODUCTION','["SPX FLOW","Admix","Fristam"]',30,'["funnel_bridging","eductor_nozzle","screen_plugging","pump_cavitation"]',8000,2.0,15,12,'{"note":"Draws powder into liquid stream using venturi/eductor effect. Critical for adding cocoa, stabilizers, vitamins to fluid milk."}'],
['LIQUID_BLENDER','In-Line Liquid Blending System','PRODUCTION','["Tetra Pak","SPX FLOW","Alfa Laval"]',30,'["flow_meter_drift","modulating_valve","recipe_error","batch_controller","ratio_accuracy"]',8000,3.0,15,18,'{"note":"Automated blending of multiple liquid streams (skim, cream, condensed, ingredients) to target fat/protein/solids specs."}'],
['INGREDIENT_TANK','Ingredient/Vitamin Dosing Day Tank','PRODUCTION','["Walker Stainless","DCI","Lee Industries"]',90,'["level_sensor","agitator","metering_pump","CIP_coverage","scale_buildup"]',15000,1.5,20,12,'{"capacity":"50-500 gal","note":"Holds pre-mixed vitamins, stabilizers, flavors for controlled addition to product stream."}'],
['BATCH_MIXER','Batch Mixing Tank with High-Speed Agitator','PRODUCTION','["Walker Stainless","DCI","Lee Industries","APV"]',30,'["agitator_motor","shaft_seal","baffle_damage","vortex_problem","discharge_valve"]',10000,2.0,25,12,'{"note":"Used for chocolate milk, flavored milks, protein drinks. Bottom-entering or top-mount agitator with variable speed."}'],
['RECOMBINATION_SYS','Milk Recombination/Reconstitution System','PRODUCTION','["Tetra Pak","GEA","SPX FLOW"]',14,'["powder_dissolving","fat_dosing","homogenizer_interface","standardization","pasteurizer_interface"]',5000,5.0,15,18,'{"note":"Reconstitutes milk from powder + water + fat. Used in regions where fresh milk supply is inconsistent."}'],

// ── TANKS — Fill to 100% ─────────────────────────────────────────────
['PROCESS_TANK','General Process/Hold Tank (Jacketed)','PRODUCTION','["Walker Stainless","DCI","Cherry-Burrell","Feldmeier","Paul Mueller"]',90,'["agitator_failure","jacket_leak","level_sensor","CIP_sprayball","discharge_valve_leak","thermowell"]',15000,2.0,30,12,'{"capacity":"200-10000 gal","material":"316L SS","note":"Workhorse of every dairy plant. Jacketed for heating/cooling. Vertical or horizontal."}'],
['DAY_TANK','Ingredient Day Tank (Non-Jacketed)','PRODUCTION','["Walker Stainless","DCI","Central States"]',90,'["level_sensor","agitator","drain_valve","CIP_coverage"]',20000,1.0,25,0,'{"note":"Smaller tanks for daily ingredient prep. Often portable on casters for flexibility."}'],
['COP_TANK','Clean-Out-of-Place (COP) Tank','UTILITY','["Sani-Matic","Custom","Central States"]',90,'["heater_element","pump_seal","temperature_controller","basket_screen","drain_valve"]',12000,2.0,20,12,'{"note":"Heated soak tank for disassembled parts (valve bodies, filler heads, gaskets). Essential for sanitation."}'],
['WEIGH_TANK','Weigh Tank / Load Cell Tank','PRODUCTION','["Walker Stainless","Rice Lake","Custom"]',90,'["load_cell_drift","junction_box_moisture","agitator_vibration","calibration","dump_valve"]',12000,2.0,25,12,'{"note":"Tanks mounted on load cells for accurate batching. Used in cheese vats, ingredient systems, and receiving."}'],
['SURGE_TANK','Surge/Buffer Tank','PRODUCTION','["Walker Stainless","DCI","Custom"]',90,'["level_control","float_valve","overflow","pump_starve","CIP"]',20000,1.0,25,0,'{"note":"Small inline tank to absorb flow variations between process steps. Critical between separator and pasteurizer."}'],
['SILO_HORIZONTAL','Horizontal Storage Tank','PRODUCTION','["Mueller","Walker Stainless","Dari-Kool"]',180,'["agitator_failure","sight_glass","level_probe","manway_gasket","leg_support","CIP_sprayball"]',15000,2.0,30,12,'{"note":"Horizontal tanks common at farms and small plants. 1000-8000 gal. Often insulated but not jacketed."}'],
['SILO_VERTICAL','Vertical Silo (Outdoor, Insulated)','PRODUCTION','["Walker Stainless","Feldmeier","DCI","Cherry-Burrell"]',180,'["agitator_bearing","top_manway_gasket","level_radar","insulation_damage","CIP_rotation","bottom_valve","pad_heater"]',15000,2.0,35,12,'{"capacity":"10000-60000 gal","note":"Outdoor vertical silos. Insulated, often heated pad to prevent freezing. Radar level standard on new."}'],

// ── LEGACY EQUIPMENT — Fill to 100% ──────────────────────────────────
['LEGACY_AGITATOR','Legacy Tank Agitator (Pre-1990)','PRODUCTION','["Cherry-Burrell","Lightnin","Cleveland Mixer"]',365,'["gear_drive_wear","shaft_seal_packing","bearing_failure","impeller_crack","speed_control"]',12000,3.0,40,0,'{"note":"Old worm-gear or belt-driven agitators. Many 1970s Cherry-Burrell units still in service. Packing glands instead of mechanical seals."}'],
['LEGACY_CIP_SKID','Legacy CIP Skid (Pre-1995)','UTILITY','["Cherry-Burrell","Sani-Matic (early)","Custom"]',90,'["pump_seal","heater_element","chemical_pump","relay_logic","float_switch","chart_recorder"]',8000,3.0,30,0,'{"note":"Relay-logic CIP systems before PLC controls. Manual chemical addition. Still in service at smaller plants."}'],
['LEGACY_PNEUMATIC_XMTR','Pneumatic Instrument/Transmitter','PRODUCTION','["Foxboro","Honeywell","Taylor","Bailey"]',365,'["diaphragm_failure","bellows_leak","supply_air_regulator","gauge_drift","tubing_leak"]',15000,1.0,40,0,'{"signal":"3-15 PSI","note":"Pneumatic 3-15 PSI transmitters from 1960s-1980s. Being replaced by 4-20mA electronic. Some still in service on legacy HTST systems."}'],
['LEGACY_CHART_RECORDER','Circular Chart Recorder (Mechanical)','PRODUCTION','["Partlow","Honeywell","Anderson","ABB/Kent-Taylor"]',90,'["chart_drive_motor","pen_mechanism","thermocouple","ink_supply","clock_mechanism"]',12000,0.5,40,0,'{"note":"Mechanical circular chart recorders required by PMO for HTST pasteurizer verification. 12hr or 24hr rotation. Some plants still use 1960s Partlow units."}'],
['LEGACY_MERCURY_THERM','Mercury-in-Glass Indicating Thermometer','PRODUCTION','["Palmer","Weksler","Tel-Tru"]',365,'["mercury_column_separation","scale_fading","immersion_depth","well_corrosion"]',25000,0.25,50,0,'{"PMO_required":true,"note":"PMO still requires mercury-in-glass thermometers as the official reference for HTST at many state levels. Cannot be replaced with digital without regulatory approval."}'],
['LEGACY_VALVE_MANUAL','Legacy Manual Plug/Globe Valve (SS)','PRODUCTION','["Cherry-Burrell","Tri-Clover","Ladish"]',365,'["packing_leak","handle_wear","seat_erosion","stem_corrosion"]',20000,0.5,40,0,'{"note":"Old manual plug valves from Cherry-Burrell/Tri-Clover era. Many 1960s-70s valves still in daily use. Repacking available."}'],
['LEGACY_MOTOR_DC','Legacy DC Motor (Variable Speed)','PRODUCTION','["GE","Reliance","Westinghouse"]',365,'["brush_wear","commutator_scoring","field_winding","armature_bearing","SCR_drive_fault"]',8000,4.0,35,0,'{"note":"DC motors with SCR drives for variable speed before VFDs became affordable. Common on old fillers, conveyors. Being replaced by AC motor + VFD."}'],
['LEGACY_PUMP_DEMING','Legacy Centrifugal Pump (Industrial)','PRODUCTION','["Deming/Crane","Worthington","Goulds"]',365,'["impeller_wear","mechanical_seal","bearing_frame","coupling_alignment","base_corrosion"]',10000,3.0,40,0,'{"note":"Old industrial (non-sanitary) pumps used in utility/glycol/hot water systems. Cast iron construction. Many 1970s-80s Deming pumps still running."}'],
['LEGACY_AIR_VALVE','Legacy Air-Operated Valve (On/Off)','PRODUCTION','["Cherry-Burrell","Tri-Clover","Ladish","APV"]',365,'["diaphragm_tear","actuator_spring","seat_wear","body_gasket","air_cylinder_seal"]',12000,1.0,35,0,'{"note":"Original Cherry-Burrell/Tri-Clover air-operated butterfly and plug valves. Diaphragm actuators. Many rebuilt multiple times."}'],
];

const tx = db.transaction(() => { for (const e of equipment) ins.run(...e); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const prod = db.prepare("SELECT COUNT(*) as c FROM MasterEquipment WHERE Category='PRODUCTION'").get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterEquipment GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏭 Total Equipment: ${total} (Production: ${prod})`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
db.close();
