// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Equipment — 100% COVERAGE: Fill every remaining production gap
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
// ── PASTEURIZATION — remaining gaps ──────────────────────────────────
['ESL_SYSTEM','Extended Shelf Life (ESL) System','PRODUCTION','["Tetra Pak","GEA","SPX FLOW"]',14,'["microfiltration_membrane","aseptic_filling_interface","sterile_barrier","heat_exchanger_fouling"]',5000,6.0,20,24,'{"temp":"127-134°C for 1-4 sec","note":"Between HTST and UHT. Produces 30-90 day shelf life. Growing segment."}'],
['TUBULAR_PASTEURIZER','Tubular Pasteurizer','PRODUCTION','["HRS Group","GEA","Alfa Laval"]',30,'["inner_tube_fouling","outer_tube_scale","gasket_failure","CIP_difficulty"]',8000,4.0,20,18,'{"note":"Double-tube or triple-tube design. Better for viscous/particulate products than plate. Harder to inspect."}'],
['STEAM_INJECTION','Direct Steam Injection System','PRODUCTION','["SPX FLOW","Tetra Pak","GEA"]',14,'["steam_valve_response","vacuum_chamber","flash_vessel","condensate_removal","flavor_scalping"]',5000,6.0,20,24,'{"note":"Injects culinary steam directly into product. Used in UHT and some ESL. Instant heating."}'],
['STEAM_INFUSION','Steam Infusion System','PRODUCTION','["GEA","Tetra Pak"]',14,'["infusion_chamber","vacuum_cooling","product_distribution","condensate","nozzle_wear"]',4000,8.0,20,24,'{"note":"Product falls as film through steam chamber. Gentlest UHT method. Premium products."}'],

// ── CHEESE — remaining gaps to 100% ─────────────────────────────────
['MOZZ_COOKER','Mozzarella Cooker/Stretcher','PRODUCTION','["CMT/Johnson","Custom Fabrication","Shalongo"]',7,'["auger_wear","steam_jacket","temperature_control","water_system","discharge"]',4000,4.0,15,12,'{"temp":"140-160°F","note":"Cooks and stretches mozzarella curd in hot water or steam. Twin-screw or auger design."}'],
['MOZZ_MOLDER','Mozzarella Molder/Former','PRODUCTION','["CMT/Johnson","Shalongo"]',7,'["mold_cavity_wear","conveyor","cooling_water","forming_die","cutter"]',4000,3.0,12,12,null],
['MOZZ_BRINE_COOLER','Mozzarella Brine Cooler/Chiller','PRODUCTION','["Custom","Tetra Pak"]',30,'["brine_concentration","chiller_coil","circulation_pump","pH_control","filtration"]',8000,3.0,20,12,null],
['WHEY_DRAIN','Whey Drain/Finishing Table','PRODUCTION','["Stoelting","Scherping","Custom"]',30,'["belt_tracking","sprocket_wear","agitator","screen_plugging","bearing"]',8000,2.0,20,12,null],
['CHEESE_SALTER','Cheese Dry Salt System','PRODUCTION','["Tetra Pak","Custom"]',30,'["auger_feed","salt_hopper_bridge","moisture_sensor","distribution_pattern"]',8000,2.0,20,0,null],
['CHEESE_VACUUM_PACK','Cheese Vacuum Packaging Machine','PACKAGING','["Cryovac/Sealed Air","Multivac","Koch"]',7,'["vacuum_pump","seal_bar","bag_detect","shrink_tunnel","clip_mechanism"]',5000,2.0,12,12,null],
['CHEESE_AGING_ROOM','Cheese Aging/Curing Room','PRODUCTION','["Custom","Heatcraft","Bohn"]',365,'["humidity_control","temperature_uniformity","fan_motor","evaporator_coil","mold_growth","turning_robot"]',10000,3.0,30,12,'{"temp":"45-55°F","humidity":"80-95% RH","note":"Controlled environment for cheese maturation. Days to years."}'],
['CHEESE_WHEEL_TURNER','Cheese Wheel Turner/Robot','PRODUCTION','["Custom","KUKA","Fanuc"]',90,'["gripper_mechanism","positioning","conveyor_sync","PLC_fault","servo_motor"]',6000,2.0,15,18,null],

// ── WHEY PROCESSING — fill from ~20% to 100% ────────────────────────
['WHEY_SILO','Whey Storage Silo','PRODUCTION','["Walker Stainless","DCI","Feldmeier"]',180,'["agitator","level_sensor","pH_drift","CIP","insulation","acid_whey_corrosion"]',15000,2.0,30,12,'{"note":"Sweet whey or acid whey storage. Must process quickly to prevent acidification."}'],
['WHEY_CREAM_SEPARATOR','Whey Cream Separator','PRODUCTION','["GEA Westfalia","Alfa Laval"]',21,'["bowl_vibration","disc_fouling","fat_recovery","seal_ring","fines_removal"]',6000,5.0,20,24,'{"note":"Recovers whey cream (high phospholipid). Feed to butter churn or sold separately."}'],
['WHEY_PASTEURIZER','Whey Pasteurizer','PRODUCTION','["Alfa Laval","GEA","APV/SPX"]',30,'["plate_fouling","protein_denaturation","gasket_leak","CIP_frequency"]',6000,3.0,20,18,'{"note":"Pasteurizes whey before further processing. Fouling is major challenge due to protein content."}'],
['WHEY_RO','Whey RO (Reverse Osmosis) Concentrator','PRODUCTION','["Koch Membrane","GEA","Pall"]',30,'["membrane_fouling","high_pressure_pump","permeate_quality","pre-filter","CIP"]',5000,4.0,10,12,'{"note":"Concentrates whey from 6% to 18-22% solids before evaporation. Saves energy."}'],
['WHEY_PROTEIN_SYSTEM','Whey Protein Concentrate/Isolate System','PRODUCTION','["Koch Membrane","GEA","Alfa Laval"]',14,'["UF_membrane","diafiltration","evaporator_interface","spray_dryer_feed","protein_yield"]',4000,6.0,15,18,'{"note":"WPC34/WPC80/WPI90 production. UF + diafiltration + evaporation + drying."}'],
['LACTOSE_CRYSTALLIZER','Lactose Crystallization Tank','PRODUCTION','["GEA","SPX FLOW","Custom"]',30,'["agitator_drive","cooling_jacket","crystal_size","seed_dosing","temperature_profile_PLC"]',6000,4.0,20,18,'{"note":"Controlled cooling crystallization of lactose from whey permeate."}'],
['LACTOSE_DRYER','Lactose Dryer (Fluid Bed or Rotary)','PRODUCTION','["GEA","Bepex","Carrier","Andritz"]',30,'["air_heater","fluidization","bag_filter","exhaust_fan","product_moisture"]',5000,4.0,20,18,null],
['PERMEATE_SYSTEM','Whey Permeate Processing System','PRODUCTION','["Koch","GEA","Custom"]',30,'["NF_membrane","demineralization","evaporator","crystallizer","drying"]',5000,4.0,15,18,'{"note":"Converts UF permeate into edible lactose or demineralized whey powder."}'],

// ── ICE CREAM — remaining gaps to 100% ───────────────────────────────
['IC_INGREDIENT_WEIGH','Ice Cream Ingredient Weighing/Batching','PRODUCTION','["Sterling Systems","Schenck","Custom"]',30,'["scale_calibration","hopper_bridging","auger_feed","batch_controller","dust_collection"]',8000,2.0,15,12,null],
['IC_CONE_FILLER','Ice Cream Cone Filling/Lidding Machine','PACKAGING','["Tetra Pak/Hoyer","Gram","Robert Bosch"]',7,'["cone_feeder","fill_head","lid_placer","conveyor_sync","weight_control"]',3500,3.0,12,12,null],
['IC_SANDWICH_MAKER','Ice Cream Sandwich/Novelty Former','PACKAGING','["Tetra Pak/Hoyer","Gram"]',7,'["wafer_feeder","fill_deposit","wrapper","conveyor","cutting_wire"]',3500,3.0,12,12,null],
['IC_DIPPING_CABINET','Ice Cream Dipping Cabinet/Display','FACILITY','["Master-Bilt","True","Hussmann"]',365,'["compressor","thermostat","fan_motor","door_gasket","defrost_heater"]',15000,2.0,10,12,null],
['IC_BATCH_FREEZER','Batch Ice Cream Freezer','PRODUCTION','["Carpigiani","Taylor","Emery Thompson"]',14,'["dasher_bearing","scraper_blade","refrigerant_charge","overrun_control","mix_pump"]',5000,3.0,15,12,'{"note":"Small batch artisan freezers. 2-10 gallon capacity. Common in specialty/craft."}'],

// ── YOGURT/CULTURED — remaining gaps to 100% ────────────────────────
['GREEK_STRAINER','Greek Yogurt Straining/Separation System','PRODUCTION','["Tetra Pak","GEA","Westfalia"]',14,'["separator_bowl","whey_removal_rate","protein_concentration","CIP","acid_whey_disposal"]',5000,5.0,15,18,'{"note":"Centrifugal or membrane-based. Removes acid whey to concentrate protein. Major waste stream challenge."}'],
['KEFIR_FERMENTER','Kefir Fermentation Tank','PRODUCTION','["Walker Stainless","DCI"]',30,'["agitator_speed","temperature_control","CO2_venting","culture_grain_recovery","pH_monitoring"]',12000,2.0,20,12,'{"note":"Kefir uses grain or direct-set cultures. CO2 production requires venting. Growing category."}'],
['BUTTERMILK_LINE','Cultured Buttermilk Processing Line','PRODUCTION','["SPX FLOW","Tetra Pak"]',30,'["pasteurizer","culture_dosing","incubation_tank","cooler","filler_viscosity"]',6000,4.0,20,18,null],
['DIP_LINE','Dip/Sour Cream/Cottage Cheese Filling','PACKAGING','["HAMBA","Waldner","Hassia"]',7,'["piston_filler","cup_denest","foil_seal","date_coder","case_packer_interface"]',3500,2.5,10,12,null],

// ── BUTTER — remaining gaps to 100% ─────────────────────────────────
['AMF_SYSTEM','Anhydrous Milk Fat (AMF/Butter Oil) System','PRODUCTION','["GEA","SPX FLOW","Alfa Laval"]',14,'["evaporator","separator","vacuum_dryer","pump_seal","temperature_control"]',5000,6.0,20,18,'{"note":"Produces 99.8%+ milk fat. Used in recombination, confectionery, and export."}'],
['BUTTER_CUTTER','Butter Cutting/Portioning Machine','PRODUCTION','["GEA","Ilapak","Multivac"]',14,'["cutting_wire","portion_accuracy","conveyor_sync","wrapper_interface"]',5000,2.0,15,12,null],

// ── RAW MILK — remaining gaps ────────────────────────────────────────
['TANKER_WASH','Tanker Wash System','UTILITY','["Sani-Matic","Custom","Kärcher"]',90,'["spray_nozzle","chemical_pump","hot_water_supply","drain_system","PLC"]',8000,2.0,20,12,'{"note":"CIP system for cleaning milk tanker trailers between loads."}'],
['MILK_METER','Milk Meter/Totalizer (Receiving)','PRODUCTION','["Endress+Hauser","Yokogawa","Emerson"]',365,'["flow_sensor_fouling","temperature_comp","totalizer_error","calibration"]',10000,1.0,15,18,'{"note":"Custody transfer meter for receiving. Must meet Weights & Measures standards."}'],
['FARM_BULK_TANK','Farm Bulk Milk Cooler','PRODUCTION','["Mueller","Dairy Craft","Dari-Kool","Sunset"]',180,'["compressor","agitator","refrigerant_leak","thermostat","wash_system"]',12000,2.0,20,12,'{"note":"On-farm cooling. Not in processing plant but techs service them for co-op plants."}'],

// ── HEAT EXCHANGE — remaining gaps ───────────────────────────────────
['PHE_STANDALONE','Plate Heat Exchanger (Standalone/Utility)','PRODUCTION','["Alfa Laval","GEA","Tranter","APV"]',90,'["plate_crack","gasket_leak","fouling","flow_distribution","pressure_drop"]',10000,3.0,20,18,'{"note":"Standalone PHEs used for glycol/water heating, hot water generation. Not part of HTST."}'],
['DOUBLE_TUBE_HX','Double-Tube Heat Exchanger','PRODUCTION','["HRS Group","Alfa Laval"]',90,'["inner_tube_fouling","outer_tube_scale","gasket","CIP_velocity","thermal_shock"]',10000,3.0,20,18,'{"note":"Tube-in-tube design. Good for viscous products. Easier to CIP than shell-and-tube."}'],

// ── PACKAGING — remaining gaps to 100% ───────────────────────────────
['ASEPTIC_FILLER','Aseptic Filler/Packaging System','PACKAGING','["Tetra Pak","SIG","Elopak","Scholle IPN"]',7,'["sterile_barrier","fill_head","package_forming","date_coder","sterilant_system"]',3000,6.0,15,24,'{"note":"H2O2 or steam sterilized packaging. Critical for ESL and UHT shelf-stable products."}'],
['BOTTLE_FILLER','HDPE/PET Bottle Filler','PACKAGING','["Krones","KHS","GEA","Sidel"]',7,'["fill_valve","capper","rinser","CIP","conveyor_sync","foam_control"]',4000,3.0,12,18,null],
['CARTON_ERECTOR','Carton Erector/Opener','PACKAGING','["Evergreen","Elopak","SIG"]',7,'["magazine_feed","mandrel","bottom_fold","glue_system","carton_detect"]',5000,2.0,12,12,null],
['GRAVITY_CASE_SEALER','Gravity/Manual Case Sealer','PACKAGING','["3M-Matic","Belcor","BestPack"]',90,'["tape_head","pressure_roller","belt_tension","guide_rail"]',12000,1.0,15,12,null],
['TRAY_PACKER','Tray Packer/Wrap-Around','PACKAGING','["Douglas Machine","Delkor","Pearson"]',14,'["blank_feed","product_collation","glue_system","compression","servo_fault"]',5000,2.5,12,18,null],
['SLEEVE_WRAPPER','Sleeve/Band Wrapper','PACKAGING','["Arpac","Polypack","Douglas"]',14,'["film_tracking","seal_bar","conveyor","film_tension","cutter"]',5000,1.5,10,12,null],
['DEPALLETIZER','Depalletizer','PACKAGING','["Intelligrated","Columbia","Ouellette"]',30,'["gripper","layer_pad_removal","conveyor_sync","photo_eye","servo"]',6000,3.0,15,18,null],
['CRATE_WASHER','Milk Crate/Tray Washer','PACKAGING','["Kuhl","Sani-Matic","Douglas"]',30,'["spray_nozzle","heater","conveyor_chain","detergent_pump","drain"]',8000,2.0,15,12,null],
];

const tx = db.transaction(() => { for (const e of equipment) ins.run(...e); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterEquipment GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏆 TOTAL EQUIPMENT TYPES: ${total}`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
db.close();
