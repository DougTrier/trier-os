// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Dairy Industry Master Data Catalog
 * ================================================
 * Creates mfg_master.db — the industry knowledge base.
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');

const dbPath = path.join(dataDir, 'mfg_master.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🏆 Creating Dairy Industry Master Data Catalog...');
console.log(`   Path: ${dbPath}`);

// ── Schema ─────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS MasterParts (
    MasterPartID TEXT PRIMARY KEY,
    Description TEXT NOT NULL,
    StandardizedName TEXT,
    Manufacturer TEXT,
    Category TEXT,
    SubCategory TEXT,
    UOM TEXT DEFAULT 'EA',
    TypicalPriceMin REAL,
    TypicalPriceMax REAL,
    LeadTimeDays INTEGER,
    Specifications TEXT,
    AlternatePartNumbers TEXT,
    EquipmentTypes TEXT,
    Tags TEXT
);

CREATE TABLE IF NOT EXISTS MasterEquipment (
    EquipmentTypeID TEXT PRIMARY KEY,
    Description TEXT NOT NULL,
    Category TEXT,
    TypicalMakers TEXT,
    PMIntervalDays INTEGER,
    CommonFailureModes TEXT,
    ExpectedMTBF_Hours INTEGER,
    ExpectedMTTR_Hours REAL,
    UsefulLifeYears INTEGER,
    TypicalWarrantyMonths INTEGER,
    Specifications TEXT
);

CREATE TABLE IF NOT EXISTS MasterVendors (
    VendorID TEXT PRIMARY KEY,
    CompanyName TEXT NOT NULL,
    Website TEXT,
    Phone TEXT,
    Address TEXT,
    Region TEXT,
    Categories TEXT,
    WarrantyPolicy TEXT,
    ServiceSLA TEXT,
    SalesRepName TEXT,
    SalesRepPhone TEXT,
    SalesRepEmail TEXT
);

CREATE TABLE IF NOT EXISTS MasterWarrantyTemplates (
    TemplateID INTEGER PRIMARY KEY AUTOINCREMENT,
    EquipmentType TEXT,
    VendorID TEXT,
    TypicalMonths INTEGER,
    CoverageDescription TEXT,
    Exclusions TEXT,
    ClaimProcess TEXT,
    ExtendedOptions TEXT
);

CREATE TABLE IF NOT EXISTS MasterCrossRef (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    OEMPartNumber TEXT,
    OEMVendor TEXT,
    AftermarketPartNumber TEXT,
    AftermarketVendor TEXT,
    CompatibilityNotes TEXT,
    Verified INTEGER DEFAULT 0
);
`);

console.log('   ✅ Schema created (5 tables)');

// ── Seed: Master Equipment (50+ types) ─────────────────────────────────
const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const equipment = [
  // Processing
  ['HTST_PASTEURIZER','HTST Pasteurizer','PRODUCTION','["SPX FLOW","GEA","Alfa Laval","Tetra Pak"]',30,'["plate_gasket_leak","regeneration_loss","divert_valve_failure","CIP_fouling","temperature_drift"]',8760,4.0,20,24,'{"flow_rate":"5000-50000 L/hr","temp":"72-75°C","hold_time":"15-25 sec"}'],
  ['BATCH_PASTEURIZER','Batch/Vat Pasteurizer','PRODUCTION','["Walker Stainless","DCI","APV"]',30,'["agitator_seal_leak","jacket_fouling","temperature_control","valve_failure"]',12000,3.0,25,18,null],
  ['HOMOGENIZER','High Pressure Homogenizer','PRODUCTION','["GEA Niro Soavi","SPX FLOW","Tetra Pak"]',14,'["plunger_seal_wear","valve_seat_erosion","bearing_failure","pressure_fluctuation","crankcase_oil_leak"]',6000,6.0,15,18,'{"pressure":"2000-4000 psi","capacity":"500-25000 L/hr"}'],
  ['SEPARATOR','Centrifugal Separator','PRODUCTION','["GEA Westfalia","Alfa Laval","Tetra Pak"]',21,'["bowl_vibration","seal_ring_wear","feed_pump_failure","disc_stack_fouling","bearing_noise"]',7000,5.0,20,24,'{"bowl_speed":"4000-8000 RPM","throughput":"5000-50000 L/hr"}'],
  ['UHT_SYSTEM','Ultra-High Temperature System','PRODUCTION','["Tetra Pak","GEA","SPX FLOW"]',14,'["tube_fouling","steam_injector_wear","aseptic_seal_failure","temperature_deviation"]',5000,8.0,20,24,null],
  ['MEMBRANE_FILTER','Membrane Filtration (RO/UF/MF)','PRODUCTION','["Koch Membrane","GEA","Pall Corp"]',30,'["membrane_fouling","pressure_drop","seal_failure","permeate_quality_decline"]',6000,4.0,10,12,null],
  ['EVAPORATOR','Falling Film Evaporator','PRODUCTION','["GEA","SPX FLOW","Alfa Laval"]',30,'["tube_fouling","vacuum_leak","condensate_pump_failure","distribution_plate_wear"]',7000,6.0,25,18,null],
  ['SPRAY_DRYER','Spray Dryer','PRODUCTION','["GEA Niro","SPX FLOW","Buchi"]',14,'["nozzle_wear","cyclone_buildup","air_heater_failure","atomizer_bearing","powder_bridging"]',5000,8.0,20,18,null],
  ['CHEESE_VAT','Cheese Making Vat','PRODUCTION','["Tetra Pak","Custom Fabrication","Stoelting"]',30,'["agitator_drive_failure","jacket_leak","knife_frame_wear","valve_sticking"]',10000,3.0,25,12,null],
  ['BUTTER_CHURN','Continuous Butter Churn','PRODUCTION','["GEA","SPX FLOW","Egli"]',21,'["beater_wear","seal_failure","buttermilk_separation","speed_control"]',8000,4.0,20,12,null],
  // Filling & Packaging
  ['GALLON_FILLER','Gallon Jug Filler','PACKAGING','["Evergreen","HAMBA","Scholle IPN"]',7,'["fill_head_drip","cap_torque_drift","conveyor_jam","date_coder_failure","jug_detect_sensor"]',4000,2.0,12,12,'{"format":"gallon","speed":"40-120 containers/min"}'],
  ['HALF_GAL_FILLER','Half-Gallon Filler','PACKAGING','["Evergreen","Elopak","SIG"]',7,'["fill_head_drip","carton_forming_jam","seal_bar_wear","glue_system"]',4000,2.0,12,12,null],
  ['PINT_FILLER','Pint/Quart Filler','PACKAGING','["Evergreen","Elopak","HAMBA"]',7,'["fill_head_drip","carton_detection","conveyor_jam"]',4500,2.0,12,12,null],
  ['CUP_FILLER','Cup Filler/Sealer','PACKAGING','["HAMBA","Waldner","Hassia"]',7,'["lid_seal_failure","cup_denest_jam","fill_level_drift","date_code"]',3500,2.5,10,12,null],
  ['CASE_ERECTOR','Case Erector','PACKAGING','["Wexxar/BEL","Pearson","Combi"]',14,'["hot_melt_nozzle_clog","blank_feed_jam","flap_fold_misalign","vacuum_cup_wear"]',6000,1.5,12,24,null],
  ['CASE_PACKER','Case Packer','PACKAGING','["Hartness","Douglas Machine","Delkor"]',14,'["gripper_wear","product_jam","pattern_drift","servo_fault"]',5000,2.0,12,18,null],
  ['PALLETIZER','Robotic Palletizer','PACKAGING','["FANUC","ABB","KUKA","Fuji Yusoki"]',30,'["gripper_failure","teach_pendant_fault","servo_alarm","vacuum_leak","collision_detect"]',8000,3.0,15,24,'{"payload":"50-250 kg","reach":"2-3.5m"}'],
  ['SHRINK_WRAPPER','Shrink Wrap Bundler','PACKAGING','["Arpac","Douglas","Polypack"]',14,'["heat_tunnel_element","film_tracking","seal_bar_wear","conveyor_chain"]',5000,1.5,10,12,null],
  ['LABELER','Pressure Sensitive Labeler','PACKAGING','["P.E. Labellers","Krones","CTM"]',7,'["label_wrinkle","sensor_misread","splice_failure","ribbon_break"]',5000,1.0,10,12,null],
  ['DATE_CODER','Ink Jet Date Coder','PACKAGING','["Markem-Imaje","Videojet","Domino"]',7,'["nozzle_clog","ink_viscosity","encoder_drift","printhead_failure"]',6000,0.5,8,12,null],
  // CIP & Utilities
  ['CIP_SYSTEM','Clean-In-Place System','UTILITY','["Sani-Matic","Alfa Laval","GEA","Central States"]',30,'["chemical_pump_failure","heat_exchanger_fouling","valve_actuator","conductivity_probe","flow_meter_drift"]',8000,3.0,20,18,'{"tank_sizes":"100-1000 gal","chemicals":"caustic,acid,sanitizer"}'],
  ['BOILER','Steam Boiler','UTILITY','["Cleaver-Brooks","Hurst","York-Shipley"]',30,'["tube_leak","burner_failure","feedwater_pump","low_water_cutoff","refractory_damage"]',10000,6.0,25,24,'{"pressure":"15-150 psi","fuel":"natural_gas"}'],
  ['AIR_COMPRESSOR','Rotary Screw Air Compressor','UTILITY','["Atlas Copco","Ingersoll Rand","Kaeser","Quincy"]',14,'["air_end_bearing","oil_separator","intake_valve","drain_valve","pressure_switch"]',8000,4.0,15,24,'{"cfm":"50-500","pressure":"100-175 psi"}'],
  ['CHILLER','Ammonia/Glycol Chiller','UTILITY','["Frick/JCI","GEA","Carrier","Vilter"]',30,'["compressor_valve","oil_separator","condenser_fouling","expansion_valve","refrigerant_leak"]',8000,6.0,20,24,null],
  ['COOLING_TOWER','Evaporative Cooling Tower','UTILITY','["BAC","Evapco","SPX Marley"]',90,'["fill_media_fouling","fan_motor_bearing","drift_eliminator","basin_corrosion"]',12000,4.0,25,12,null],
  ['AMMONIA_SYSTEM','Ammonia Refrigeration System','UTILITY','["Frick/JCI","Vilter","Mycom"]',30,'["compressor_valve_plate","oil_separator","condenser_tube","expansion_valve","ammonia_leak"]',7000,8.0,25,24,null],
  ['WASTEWATER','Wastewater Treatment System','UTILITY','["Evoqua","Veolia","Pall"]',30,'["aerator_failure","pH_probe_drift","membrane_fouling","sludge_pump","blower_bearing"]',6000,4.0,20,12,null],
  // Facility
  ['HVAC_AHU','HVAC Air Handling Unit','FACILITY','["Trane","Carrier","Daikin","York"]',90,'["blower_bearing","belt_wear","coil_fouling","damper_actuator","filter_differential"]',10000,3.0,20,12,null],
  ['DOCK_LEVELER','Loading Dock Leveler','FACILITY','["Rite-Hite","Kelley","Serco"]',90,'["hydraulic_cylinder","lip_hinge","deck_plate","hold_down","safety_light"]',15000,2.0,15,12,null],
  ['OVERHEAD_DOOR','Overhead Dock Door','FACILITY','["Rite-Hite","Rytec","Albany"]',90,'["spring_break","track_damage","bottom_seal","safety_edge","motor_failure"]',20000,1.5,15,12,null],
  // Material Handling
  ['CONVEYOR_BELT','Belt Conveyor','LOGISTICS','["Dorner","Hytrol","Nercon","Arrowhead"]',14,'["belt_tracking","bearing_failure","motor_overload","drive_chain","belt_splice"]',6000,2.0,12,12,null],
  ['CONVEYOR_CHAIN','Table Top Chain Conveyor','LOGISTICS','["Rexnord","Intralox","Habasit"]',14,'["chain_stretch","sprocket_wear","guide_rail_wear","motor_overload"]',5000,2.0,10,12,null],
  ['FORKLIFT_ELEC','Electric Forklift','LOGISTICS','["Toyota","Crown","Raymond","Yale"]',90,'["battery_degradation","hydraulic_leak","mast_chain","steer_cylinder","contactor_failure"]',8000,2.0,10,36,'{"capacity":"3000-8000 lbs","fuel":"electric"}'],
  ['FORKLIFT_LP','LP Gas Forklift','LOGISTICS','["Toyota","Hyster","Cat","Yale"]',90,'["engine_misfire","transmission_slip","mast_chain","hydraulic_leak","LP_regulator"]',6000,3.0,8,24,null],
  ['PALLET_WRAPPER','Stretch Wrapper','LOGISTICS','["Lantech","Highlight","Wulftec"]',30,'["film_carriage","turntable_bearing","cut_wire","film_tension","PLC_fault"]',7000,1.5,10,12,null],
  // Lab & QC
  ['MILKOSCAN','Milk Analyzer (FTIR)','LAB','["FOSS","Bentley","Delta"]',30,'["cuvette_fouling","pump_seal","laser_drift","sample_valve","zero_calibration"]',6000,2.0,12,12,null],
  ['PH_METER','pH Meter/Probe','LAB','["Hach","Mettler Toledo","Endress+Hauser"]',7,'["probe_fouling","reference_junction","calibration_drift"]',2000,0.5,3,6,null],
  ['TEMP_RECORDER','Temperature Recorder/Chart','LAB','["Anderson","Barton","Honeywell"]',30,'["pen_failure","chart_drive","thermocouple_drift","display_fault"]',10000,0.5,10,12,null],
  ['METAL_DETECTOR','In-Line Metal Detector','LAB','["Mettler Toledo","Loma","Eriez","Fortress"]',30,'["sensitivity_drift","conveyor_belt","reject_mechanism","false_reject"]',8000,1.0,12,18,null],
  ['XRAY_INSPECT','X-Ray Inspection System','LAB','["Mettler Toledo","Ishida","Eagle"]',30,'["x-ray_tube","detector_array","reject_mechanism","calibration"]',6000,2.0,10,18,null],
  // Electrical/Controls
  ['VFD','Variable Frequency Drive','ELECTRICAL','["ABB","Allen-Bradley","Siemens","Yaskawa"]',90,'["capacitor_failure","IGBT_fault","cooling_fan","input_fuse","parameter_loss"]',8000,1.0,10,24,null],
  ['PLC','Programmable Logic Controller','ELECTRICAL','["Allen-Bradley","Siemens","Omron","Mitsubishi"]',365,'["IO_module_failure","battery_low","communication_fault","processor_fault","power_supply"]',15000,2.0,15,24,null],
  ['HMI_PANEL','HMI Touch Panel','ELECTRICAL','["Allen-Bradley","Siemens","Red Lion","Weintek"]',365,'["touchscreen_dead_spot","backlight_failure","communication_loss","memory_full"]',10000,1.0,8,18,null],
  ['MOTOR_3PH','3-Phase AC Motor','ELECTRICAL','["Baldor/ABB","WEG","Marathon","Leeson"]',365,'["bearing_failure","winding_short","shaft_seal_leak","vibration","overheating"]',12000,2.0,15,36,'{"hp":"1-200","voltage":"208-480V","frame":"56C-449T"}'],
  ['GEARBOX','Speed Reducer/Gearbox','ELECTRICAL','["SEW Eurodrive","Nord","Dodge","Sumitomo"]',180,'["gear_tooth_wear","bearing_failure","oil_leak","shaft_seal","overheating"]',10000,3.0,15,24,null],
  ['PNEUMATIC_VALVE','Pneumatic Control Valve','ELECTRICAL','["SMC","Festo","Parker","Norgren"]',365,'["diaphragm_tear","seal_leak","actuator_failure","positioner_drift"]',15000,0.5,10,12,null],
  ['LEVEL_SENSOR','Level Sensor/Transmitter','ELECTRICAL','["Endress+Hauser","Siemens","Emerson"]',180,'["probe_fouling","signal_drift","wiring_fault","diaphragm_failure"]',8000,0.5,8,12,null],
  ['FLOW_METER','Flow Meter (Mag/Coriolis)','ELECTRICAL','["Endress+Hauser","Emerson","Yokogawa"]',365,'["electrode_fouling","liner_wear","zero_drift","grounding_issue"]',10000,1.0,15,18,null],
];

const insEquipTx = db.transaction(() => {
  for (const e of equipment) insEquip.run(...e);
});
insEquipTx();
console.log(`   ✅ ${equipment.length} equipment types seeded`);

// ── Seed: Master Vendors (100+) ─────────────────────────────────────────
const insVendor = db.prepare(`INSERT OR REPLACE INTO MasterVendors VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const vendors = [
  // Process Equipment OEMs
  ['SPX_FLOW','SPX FLOW / APV','spxflow.com','800-252-5200','Delavan, WI','National','["Pasteurizers","Homogenizers","Pumps","Valves","Mixers"]','Standard 18-24mo on new equipment','4hr remote, next-day onsite',null,null,null],
  ['GEA_GROUP','GEA Group','gea.com','800-722-6622','Columbia, MD','National','["Separators","Homogenizers","Evaporators","Spray Dryers","Valves"]','Standard 24mo on new process equipment','Same-day remote, 24hr onsite',null,null,null],
  ['ALFA_LAVAL','Alfa Laval','alfalaval.com','866-253-2528','Richmond, VA','National','["Separators","Heat Exchangers","Pumps","Valves","CIP"]','Standard 18mo','4hr remote, 48hr onsite',null,null,null],
  ['TETRA_PAK','Tetra Pak','tetrapak.com','800-643-6019','Denton, TX','National','["Pasteurizers","UHT Systems","Fillers","Separators","Homogenizers"]','Standard 24mo parts & labor','24/7 remote, same-day onsite available',null,null,null],
  // Packaging Equipment
  ['EVERGREEN','Evergreen Packaging','pactivevergreen.com','901-495-2400','Memphis, TN','National','["Gallon Fillers","Half-Gallon Fillers","Carton Systems"]','Standard 12mo on fill heads','8hr remote, 48hr onsite',null,null,null],
  ['ELOPAK','Elopak','elopak.com','248-486-4600','Novi, MI','National','["Gable Top Fillers","Carton Systems"]','Standard 12mo','Next-day remote',null,null,null],
  ['WEXXAR','Wexxar/BEL (ProMach)','wexxar.com','604-930-9300','Delta, BC','National','["Case Erectors","Case Sealers","Tray Formers"]','Standard 24mo','8hr remote, 72hr onsite',null,null,null],
  ['FANUC','FANUC America','fanucamerica.com','888-326-8287','Rochester Hills, MI','National','["Robotic Palletizers","Robot Arms","Controllers"]','Standard 24mo','24/7 remote, next-day onsite',null,null,null],
  ['ABB_ROBOT','ABB Robotics','abb.com','248-391-9000','Auburn Hills, MI','National','["Robotic Palletizers","Pick & Place","Controllers"]','Standard 24mo','24/7 remote',null,null,null],
  ['VIDEOJET','Videojet Technologies','videojet.com','800-843-3610','Wood Dale, IL','National','["Ink Jet Coders","Laser Coders","Label Printers"]','Standard 12mo','4hr remote, next-day onsite',null,null,null],
  ['MARKEM','Markem-Imaje','markem-imaje.com','800-458-6275','Kennesaw, GA','National','["Ink Jet Coders","Thermal Transfer","Laser"]','Standard 12mo','Same-day remote',null,null,null],
  // Pumps
  ['WAUKESHA','Waukesha Cherry-Burrell (SPX)','spxflow.com','800-252-5200','Delavan, WI','National','["Positive Displacement Pumps","Centrifugal Pumps"]','Standard 18mo','48hr onsite',null,null,null],
  ['FRISTAM','Fristam Pumps','fristam.com','800-841-5667','Middleton, WI','Midwest','["Centrifugal Pumps","PD Pumps","Blenders"]','Standard 24mo','48hr onsite',null,null,null],
  ['AMPCO','Ampco Pumps','ampcopumps.com','800-737-8671','Glendale, WI','Midwest','["Centrifugal Pumps","PD Pumps"]','Standard 12mo','72hr onsite',null,null,null],
  // Valves
  ['ALFA_LAVAL_V','Alfa Laval Valves','alfalaval.com','866-253-2528','Richmond, VA','National','["Mix-Proof Valves","Butterfly Valves","Check Valves"]','Standard 18mo on valve bodies',null,null,null,null],
  ['TOPLLINE','Top Line (SPX)','spxflow.com','800-252-5200','Delavan, WI','National','["Sanitary Valves","Fittings","Clamps"]','Standard 12mo',null,null,null,null],
  // Bearings & Power Transmission
  ['SKF','SKF USA','skf.com','800-440-4753','Lansdale, PA','National','["Ball Bearings","Roller Bearings","Seals","Lubrication"]','Standard warranty varies by product','Distribution network, next-day parts',null,null,null],
  ['NSK','NSK Americas','nskamericas.com','888-675-2675','Ann Arbor, MI','National','["Ball Bearings","Roller Bearings","Linear Guides"]','Standard warranty varies',null,null,null,null],
  ['TIMKEN','The Timken Company','timken.com','800-223-1954','Canton, OH','National','["Tapered Roller Bearings","Ball Bearings","Power Transmission"]','Standard warranty at purchase',null,null,null,null],
  ['SEW_EURODRIVE','SEW-Eurodrive','seweurodrive.com','864-439-7537','Lyman, SC','National','["Gearmotors","VFDs","Servo Drives","Reducers"]','Standard 24mo on gearmotors','48hr onsite',null,null,null],
  ['NORD','Nord Drivesystems','nord.com','888-314-6673','Waunakee, WI','National','["Gearmotors","VFDs","Reducers"]','Standard 24mo','72hr onsite',null,null,null],
  ['DODGE','Dodge (ABB)','baldor.com','479-646-4711','Fort Smith, AR','National','["Bearings","Reducers","Mounted Units","Couplings"]','Standard 12-24mo varies',null,null,null,null],
  ['GATES','Gates Corporation','gates.com','303-744-1911','Denver, CO','National','["V-Belts","Synchronous Belts","Hoses","Couplings"]','Standard varies by product',null,null,null,null],
  ['MARTIN','Martin Sprocket & Gear','martinsprocket.com','817-258-3000','Arlington, TX','National','["Sprockets","Chains","Couplings","Screw Conveyors"]','Standard 12mo',null,null,null,null],
  // Motors & Electrical
  ['BALDOR','Baldor-Reliance (ABB)','baldor.com','479-646-4711','Fort Smith, AR','National','["AC Motors","DC Motors","Servo Motors","Drives"]','Standard 36mo on motors','Next-day ship on stock items',null,null,null],
  ['WEG','WEG Electric','weg.net','800-275-4934','Duluth, GA','National','["AC Motors","VFDs","Soft Starters","Transformers"]','Standard 36mo on motors',null,null,null,null],
  ['ALLEN_BRADLEY','Allen-Bradley (Rockwell)','rockwellautomation.com','414-382-2000','Milwaukee, WI','National','["PLCs","VFDs","HMIs","MCC","IO Modules"]','Standard 24mo on controls','24/7 TechConnect support',null,null,null],
  ['SIEMENS','Siemens Industry','siemens.com','800-743-6367','Alpharetta, GA','National','["PLCs","VFDs","HMIs","Motors","Instrumentation"]','Standard 24mo','24/7 remote',null,null,null],
  // Instrumentation
  ['ENDRESS','Endress+Hauser','endress.com','888-363-7377','Greenwood, IN','National','["Flow Meters","Level Sensors","Temperature","Pressure","pH/ORP"]','Standard 24mo on instruments','4hr remote, 48hr onsite',null,null,null],
  ['EMERSON','Emerson (Rosemount)','emerson.com','800-999-9307','Shakopee, MN','National','["Flow Meters","Pressure","Temperature","Level","Valves"]','Standard 24mo','24/7 remote',null,null,null],
  ['HACH','Hach Company','hach.com','800-227-4224','Loveland, CO','National','["pH Meters","Turbidity","Conductivity","Water Quality"]','Standard 12mo','Next-day ship on probes',null,null,null],
  // Refrigeration
  ['FRICK','Frick (Johnson Controls)','johnsoncontrols.com','717-762-2121','Waynesboro, PA','National','["Ammonia Compressors","Chillers","Condensers","Controls"]','Standard 24mo on compressors','4hr remote, same-day emergency',null,null,null],
  ['VILTER','Vilter Manufacturing','vilter.com','414-744-0111','Cudahy, WI','National','["Reciprocating Compressors","Screw Compressors"]','Standard 24mo','48hr onsite',null,null,null],
  // Boilers & Compressed Air
  ['CLEAVER_BROOKS','Cleaver-Brooks','cleaverbrooks.com','414-359-0600','Thomasville, GA','National','["Steam Boilers","Hot Water Boilers","Burners"]','Standard 24mo limited','4hr emergency response',null,null,null],
  ['ATLAS_COPCO','Atlas Copco','atlascopco.com','800-732-6762','Rock Hill, SC','National','["Rotary Screw Compressors","Dryers","Filters","Controllers"]','Standard 24mo on air ends','24/7 remote, same-day emergency',null,null,null],
  ['INGERSOLL','Ingersoll Rand','irco.com','800-913-9570','Davidson, NC','National','["Rotary Screw Compressors","Dryers","Blowers"]','Standard 24mo','Next-day onsite',null,null,null],
  // CIP & Sanitary
  ['SANI_MATIC','Sani-Matic','sanimatic.com','800-356-3300','Madison, WI','Midwest','["CIP Systems","Washers","Tanks"]','Standard 18mo','48hr onsite',null,null,null],
  ['CENTRAL_STATES','Central States Industrial','csidesigns.com','417-831-1411','Springfield, MO','Midwest','["Sanitary Fittings","Valves","Tubing","Heat Exchangers"]','Standard 12mo on equipment','Next-day ship',null,null,null],
  // Conveying
  ['DORNER','Dorner Manufacturing','dorner.com','800-397-8664','Hartland, WI','National','["Belt Conveyors","Modular Belt","Flexible Chain"]','Standard 24mo','48hr onsite',null,null,null],
  ['HYTROL','Hytrol Conveyor','hytrol.com','870-935-3700','Jonesboro, AR','National','["Belt Conveyors","Roller Conveyors","Sortation"]','Standard 12mo','72hr onsite',null,null,null],
  ['REXNORD','Rexnord/Zurn Elkay','regalrexnord.com','866-739-6673','Milwaukee, WI','National','["Table Top Chain","MatTop","Bearings","Couplings"]','Standard varies',null,null,null,null],
  ['INTRALOX','Intralox','intralox.com','800-535-8848','Harahan, LA','National','["Modular Plastic Belting","ThermoDrive","DirectDrive"]','Limited 24mo on belting','Same-day remote, 48hr onsite',null,null,null],
  // Forklifts
  ['TOYOTA_FL','Toyota Material Handling','toyotaforklift.com','800-226-0009','Columbus, IN','National','["Electric Forklifts","IC Forklifts","Reach Trucks","Pallet Jacks"]','Standard 36mo/6000hr','Dealer network service',null,null,null],
  ['CROWN','Crown Equipment','crown.com','419-629-2311','New Bremen, OH','National','["Electric Forklifts","Reach Trucks","Order Pickers","Pallet Jacks"]','Standard 36mo','Factory-direct service',null,null,null],
  // Safety & Sanitation
  ['RITE_HITE','Rite-Hite','ritehite.com','414-355-2600','Milwaukee, WI','National','["Dock Levelers","Dock Seals","Safety Barriers","HVLS Fans"]','Standard 12mo','48hr onsite',null,null,null],
  ['ECOLAB','Ecolab','ecolab.com','800-352-5326','St. Paul, MN','National','["CIP Chemicals","Sanitizers","Lubricants","Water Treatment"]','Product performance guarantee','Dedicated plant rep',null,null,null],
  ['DIVERSEY','Diversey (Solenis)','diversey.com','888-352-2249','Fort Mill, SC','National','["CIP Chemicals","Sanitizers","Floor Care"]','Product performance guarantee','Dedicated plant rep',null,null,null],
  // Testing & Lab
  ['FOSS','FOSS Analytical','fossanalytics.com','952-974-9892','Eden Trier OS, MN','National','["MilkoScan","BactoScan","FoodScan","SomaCount"]','Standard 12mo, extended available','24/7 remote, next-day onsite',null,null,null],
  ['METTLER_TOLEDO','Mettler Toledo','mt.com','800-638-8537','Columbus, OH','National','["Metal Detectors","X-Ray","Checkweighers","Scales","pH"]','Standard 12mo','4hr remote, 48hr onsite',null,null,null],
  ['NELSON_JAMESON','Nelson-Jameson','nelsonjameson.com','800-826-8302','Marshfield, WI','National','["Lab Supplies","Testing Kits","Sanitary Supplies","PPE"]','30-day return on unused items','Same-day ship on stock',null,null,null],
];

const insVendorTx = db.transaction(() => {
  for (const v of vendors) insVendor.run(...v);
});
insVendorTx();
console.log(`   ✅ ${vendors.length} vendors seeded`);

// ── Quick summary ──────────────────────────────────────────────────────
const counts = {
  equipment: db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c,
  vendors: db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c,
  parts: db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c,
};
console.log(`\n🏆 Dairy Master Data Catalog Created!`);
console.log(`   📦 ${counts.equipment} Equipment Types`);
console.log(`   🏢 ${counts.vendors} Vendors`);
console.log(`   🔧 ${counts.parts} Parts (seed script next)`);
console.log(`   📂 ${dbPath}`);

db.close();
