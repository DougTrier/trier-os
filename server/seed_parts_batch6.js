// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 6: Electrical, Pumps, Conveying, HVAC, Wastewater, Misc
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── SWITCHGEAR & DISTRIBUTION ────────────────────────────────────────
['XFMR-DRY-15KVA','Dry Type Transformer 15KVA 480-208/120V','TRANSFORMER, DRY, 15KVA, 480-208/120V, 3PH','Square D','ELECTRICAL','Transformers','EA',800,1600,10,'{"kva":15,"primary":"480V","secondary":"208/120V","phase":3}','["Eaton V48M28T15","Hammond HPS"]','["MCC","Panel"]','transformer,dry,15kva,480,208'],
['XFMR-DRY-30KVA','Dry Type Transformer 30KVA 480-208/120V','TRANSFORMER, DRY, 30KVA, 480-208/120V, 3PH','Square D','ELECTRICAL','Transformers','EA',1400,2800,10,'{"kva":30}','["Eaton V48M28T30"]','["MCC","Panel"]','transformer,dry,30kva'],
['XFMR-DRY-75KVA','Dry Type Transformer 75KVA 480-208/120V','TRANSFORMER, DRY, 75KVA, 480-208/120V, 3PH','Square D','ELECTRICAL','Transformers','EA',3000,5500,14,'{"kva":75}',null,'["MCC","Distribution"]','transformer,dry,75kva'],
['XFMR-CPT-500VA','Control Power Transformer 500VA 480-120V','TRANSFORMER, CPT, 500VA, 480-120V','Square D','ELECTRICAL','Transformers','EA',60,140,2,'{"va":500,"primary":"480V","secondary":"120V"}','["Eaton C0500E2A","Hammond SP500ACP"]','["Control Panel","MCC"]','transformer,control,power,500va'],
['XFMR-CPT-1000VA','Control Power Transformer 1000VA 480-120V','TRANSFORMER, CPT, 1000VA, 480-120V','Square D','ELECTRICAL','Transformers','EA',90,200,2,'{"va":1000}','["Eaton C1000E2A"]','["Control Panel"]','transformer,control,1000va'],
['DISCONNECT-60A','Safety Disconnect Switch 60A 3P 600V Fusible','DISCONNECT, SAFETY, 60A, 3P, 600V, FUSIBLE','Square D','ELECTRICAL','Disconnects','EA',80,200,3,'{"amps":60,"poles":3,"fusible":true}','["Eaton DH362","Siemens HF362"]','["Motor","MCC"]','disconnect,safety,60a,fusible'],
['DISCONNECT-100A','Safety Disconnect Switch 100A 3P 600V Fusible','DISCONNECT, SAFETY, 100A, 3P, 600V, FUSIBLE','Square D','ELECTRICAL','Disconnects','EA',120,300,3,'{"amps":100}','["Eaton DH363"]','["Large Motor","MCC"]','disconnect,safety,100a'],
['DISCONNECT-200A','Safety Disconnect Switch 200A 3P 600V Fusible','DISCONNECT, SAFETY, 200A, 3P, 600V, FUSIBLE','Square D','ELECTRICAL','Disconnects','EA',250,550,5,'{"amps":200}','["Eaton DH364"]','["Large Motor","MCC"]','disconnect,safety,200a'],
['SURGE-PROTECT','Surge Protection Device 480V 3PH','SURGE PROTECTOR, 480V, 3PH, TYPE 2','Square D','ELECTRICAL','Protection','EA',150,400,5,'{"voltage":"480V","type":"SPD Type 2"}','["Eaton SPD","Leviton 48480"]','["Main Panel","MCC"]','surge,protector,spd,480v'],

// ── LIGHTING ─────────────────────────────────────────────────────────
['LED-HIGHBAY-150W','LED High Bay Light 150W 5000K IP65','LIGHT, LED, HIGH BAY, 150W, 5000K, IP65','Lithonia','ELECTRICAL','Lighting','EA',80,180,3,'{"watts":150,"lumens":22000,"color_temp":"5000K","ip":"IP65"}','["Dialight","Hubbell"]','["Warehouse","Processing","Dock"]','led,high,bay,150w,ip65'],
['LED-HIGHBAY-200W','LED High Bay Light 200W 5000K IP65','LIGHT, LED, HIGH BAY, 200W, 5000K, IP65','Lithonia','ELECTRICAL','Lighting','EA',100,240,3,'{"watts":200,"lumens":30000}',null,'["Warehouse","Processing"]','led,high,bay,200w'],
['LED-VAPOR-4FT','LED Vapor Tight 4ft 40W IP66','LIGHT, LED, VAPOR TIGHT, 4ft, 40W, IP66','Lithonia','ELECTRICAL','Lighting','EA',50,120,2,'{"watts":40,"length_ft":4,"ip":"IP66"}','["Hubbell NRG","Dialight"]','["Processing","Washdown","Cooler"]','led,vapor,tight,4ft,ip66,washdown'],
['LED-EXIT-COMBO','Exit Sign with Emergency Lights LED','LIGHT, EXIT SIGN, COMBO, LED, BATTERY BACKUP','Lithonia','ELECTRICAL','Lighting','EA',25,60,2,null,'["Hubbell CELR","Sure-Lites"]','["All Areas"]','exit,sign,emergency,light,led'],

// ── MORE PUMPS ───────────────────────────────────────────────────────
['WAUK-060-PUMP','Waukesha C-Series 060 Centrifugal Pump','PUMP, CENTRIFUGAL, WAUKESHA C-060, SS','Waukesha','FLUID','Centrifugal Pumps','EA',2500,5000,14,'{"model":"C-060","type":"centrifugal","material":"316L SS"}',null,'["Dairy Process","CIP"]','pump,centrifugal,waukesha,060,sanitary'],
['WAUK-220-PD','Waukesha 220 PD Pump','PUMP, PD, WAUKESHA 220, SS','Waukesha','FLUID','PD Pumps','EA',4000,8000,14,'{"model":"220","type":"positive_displacement"}',null,'["Dairy Process","Yogurt","Cheese"]','pump,pd,waukesha,220,sanitary'],
['FRISTAM-FP3541','Fristam FP3541 Centrifugal Pump 5HP SS','PUMP, CENTRIFUGAL, FRISTAM FP3541, 5HP, SS','Fristam','FLUID','Centrifugal Pumps','EA',2800,5500,14,'{"model":"FP3541","hp":5}',null,'["Dairy Process","CIP"]','pump,centrifugal,fristam,fp3541'],
['AMPCO-AC328','Ampco AC+ 328 Centrifugal Pump 3HP SS','PUMP, CENTRIFUGAL, AMPCO AC+328, 3HP, SS','Ampco','FLUID','Centrifugal Pumps','EA',2200,4500,14,'{"model":"AC+328","hp":3}',null,'["Dairy Process"]','pump,centrifugal,ampco,ac328'],
['GRUNDFOS-CRN5','Grundfos CRN5 Multi-Stage Pump 2HP','PUMP, MULTI-STAGE, GRUNDFOS CRN5, 2HP, SS','Grundfos','FLUID','Booster Pumps','EA',1200,2500,7,'{"model":"CRN5","hp":2,"stages":"multi"}','["Goulds e-SV"]','["Water Boost","CIP Supply"]','pump,multi,stage,grundfos,crn5'],
['SUMP-PUMP-1HP','Submersible Sump Pump 1HP SS','PUMP, SUMP, SUBMERSIBLE, 1HP, SS','Grundfos','FLUID','Sump Pumps','EA',400,900,5,'{"hp":1,"type":"submersible","material":"SS"}','["Zoeller 1049","Goulds WS"]','["Floor Drain","Pit"]','pump,sump,submersible,1hp'],

// ── CONVEYOR COMPONENTS ──────────────────────────────────────────────
['CONV-BELT-24x50','Conveyor Belt PVC White 24in x 50ft','BELT, CONVEYOR, PVC, WHITE, 24in x 50FT, FDA','Habasit','HARDWARE','Conveyor Parts','ROLL',300,700,7,'{"width_in":24,"length_ft":50,"material":"PVC","color":"white","fda":true}','["Forbo Siegling","Intralox ThermoDrive"]','["CONVEYOR_BELT","Packaging"]','belt,conveyor,pvc,white,24inch,fda'],
['CONV-BELT-36x50','Conveyor Belt PVC White 36in x 50ft','BELT, CONVEYOR, PVC, WHITE, 36in x 50FT, FDA','Habasit','HARDWARE','Conveyor Parts','ROLL',450,1000,7,'{"width_in":36}',null,'["CONVEYOR_BELT"]','belt,conveyor,pvc,36inch'],
['CONV-ROLLER-20','Gravity Roller 1.9in Dia x 20in BF Galv','ROLLER, GRAVITY, 1.9in x 20in, GALVANIZED','Hytrol','HARDWARE','Conveyor Parts','EA',8,20,2,'{"dia_in":1.9,"bf_in":20}',null,'["Roller Conveyor"]','roller,gravity,conveyor,20inch'],
['CONV-ROLLER-DRIVE','Drive Roller 2.5in Dia x 24in BF','ROLLER, DRIVE, 2.5in x 24in, LAGGED','Hytrol','HARDWARE','Conveyor Parts','EA',40,100,5,'{"dia_in":2.5,"bf_in":24,"type":"lagged"}',null,'["CONVEYOR_BELT"]','roller,drive,conveyor,lagged'],
['CONV-GUIDE-RAIL','Guide Rail UHMW 1/2 x 2 x 10ft White','RAIL, GUIDE, UHMW, 1/2x2in, 10FT, WHITE','Generic','HARDWARE','Conveyor Parts','EA',15,35,2,'{"material":"UHMW","color":"white","length_ft":10}',null,'["Conveyor","Filler Line"]','guide,rail,uhmw,conveyor,white'],
['CONV-TAKE-UP','Conveyor Take-Up Block Assembly','TAKE-UP, CONVEYOR, BLOCK ASSEMBLY','Dodge','HARDWARE','Conveyor Parts','EA',30,75,3,null,null,'["CONVEYOR_BELT"]','take-up,conveyor,belt,tension'],
['CONV-LACING-KIT','Belt Lacing Kit Clipper (For 24in belt)','LACING KIT, BELT, CLIPPER, 24in','Flexco','HARDWARE','Conveyor Parts','KIT',20,50,2,null,null,'["CONVEYOR_BELT"]','lacing,belt,clipper,splice'],
['CONV-SCRAPER','Belt Scraper/Cleaner Primary','SCRAPER, BELT, PRIMARY, ADJUSTABLE','Martin Engineering','HARDWARE','Conveyor Parts','EA',60,150,5,null,null,'["CONVEYOR_BELT"]','scraper,belt,cleaner,primary'],

// ── HVAC & FACILITY ──────────────────────────────────────────────────
['HVAC-BELT-A51','HVAC Blower Belt A51','BELT, V, A51, AHU BLOWER','Gates','HARDWARE','HVAC Parts','EA',8,18,1,'{"section":"A","number":51}','["Browning A51","Dayco A51"]','["HVAC_AHU"]','belt,v,a51,hvac,blower'],
['HVAC-BELT-B68','HVAC Blower Belt B68','BELT, V, B68, AHU BLOWER','Gates','HARDWARE','HVAC Parts','EA',10,24,1,'{"section":"B","number":68}',null,'["HVAC_AHU"]','belt,v,b68,hvac'],
['HVAC-MOTOR-1/2HP','HVAC Blower Motor 1/2HP 1075RPM 48Y','MOTOR, BLOWER, 1/2HP, 1075RPM, 48Y, HVAC','Marathon','MOTORS','HVAC Parts','EA',150,300,3,'{"hp":0.5,"rpm":1075,"frame":"48Y"}','["US Motors 8903","Fasco D923"]','["HVAC_AHU"]','motor,blower,hvac,1/2hp,48y'],
['HVAC-MOTOR-3/4HP','HVAC Blower Motor 3/4HP 1075RPM 48Y','MOTOR, BLOWER, 3/4HP, 1075RPM, 48Y, HVAC','Marathon','MOTORS','HVAC Parts','EA',180,360,3,'{"hp":0.75}',null,'["HVAC_AHU"]','motor,blower,hvac,3/4hp'],
['HVAC-THERMOSTAT','Programmable Thermostat 7-Day','THERMOSTAT, PROGRAMMABLE, 7-DAY','Honeywell','ELECTRICAL','HVAC Parts','EA',30,80,1,null,'["Emerson 1F85U","White-Rodgers"]','["HVAC"]','thermostat,programmable,honeywell'],
['HVAC-DAMPER-ACT','HVAC Damper Actuator 24V','ACTUATOR, DAMPER, 24V, HVAC','Honeywell','ELECTRICAL','HVAC Parts','EA',50,130,3,'{"voltage":"24V","torque":"35 in-lb"}','["Belimo LMB24"]','["HVAC_AHU"]','actuator,damper,hvac,24v'],
['EVAP-FAN-MOTOR','Evaporator Fan Motor 1/3HP 230V','MOTOR, EVAPORATOR FAN, 1/3HP, 230V','Kramer Trenton','MOTORS','Refrigeration','EA',120,280,5,'{"hp":0.33,"voltage":"230V"}',null,'["Walk-In Cooler","Walk-In Freezer"]','motor,evaporator,fan,cooler,freezer'],
['EVAP-DEFROST-HEAT','Defrost Heater Element 480V 3KW','HEATER, DEFROST, 480V, 3KW, EVAPORATOR','Kramer Trenton','ELECTRICAL','Refrigeration','EA',45,110,5,'{"voltage":"480V","kw":3}',null,'["Walk-In Freezer"]','heater,defrost,evaporator,freezer'],
['CONDENSER-FAN-MOTOR','Condenser Fan Motor 1HP 460V','MOTOR, CONDENSER FAN, 1HP, 460V','Baldor/ABB','MOTORS','Refrigeration','EA',280,550,5,'{"hp":1,"voltage":"460V"}',null,'["COOLING_TOWER","Condenser"]','motor,condenser,fan,1hp'],

// ── WASTEWATER ───────────────────────────────────────────────────────
['WW-AERATOR','Submersible Aerator 3HP','AERATOR, SUBMERSIBLE, 3HP','Aqua-Aerobic','FLUID','Wastewater','EA',1500,3500,14,'{"hp":3}',null,'["WASTEWATER"]','aerator,submersible,wastewater'],
['WW-SLUDGE-PUMP','Sludge Pump 2HP Progressive Cavity','PUMP, SLUDGE, 2HP, PROGRESSIVE CAVITY','Moyno','FLUID','Wastewater','EA',2000,4500,14,'{"hp":2,"type":"progressive_cavity"}',null,'["WASTEWATER"]','pump,sludge,progressive,cavity'],
['WW-PH-PROBE','Wastewater pH Probe Rugged','PROBE, pH, WASTEWATER, RUGGED, SUBMERSIBLE','Hach','ELECTRICAL','Wastewater','EA',200,500,5,null,null,'["WASTEWATER"]','probe,ph,wastewater,submersible'],
['WW-DO-PROBE','Dissolved Oxygen Probe','PROBE, DISSOLVED OXYGEN, LUMINESCENT','Hach','ELECTRICAL','Wastewater','EA',350,900,7,'{"type":"luminescent"}',null,'["WASTEWATER"]','probe,dissolved,oxygen,do'],
['WW-POLYMER','Wastewater Polymer Flocculant 275-Gal Tote','POLYMER, FLOCCULANT, WASTEWATER, 275 GAL TOTE','Polydyne','LUBRICANTS','Wastewater','TOTE',800,1800,5,'{"volume_gal":275}',null,'["WASTEWATER"]','polymer,flocculant,wastewater,tote'],

// ── DOCK & LOADING ───────────────────────────────────────────────────
['DOCK-BUMPER-12','Dock Bumper Molded Rubber 12x12x3in','BUMPER, DOCK, RUBBER, 12x12x3in','Rite-Hite','HARDWARE','Dock Parts','EA',20,50,2,'{"size":"12x12x3"}',null,'["DOCK_LEVELER"]','bumper,dock,rubber'],
['DOCK-SEAL-HEAD','Dock Seal Head Pad Foam/Vinyl','PAD, DOCK SEAL, HEAD, FOAM/VINYL','Rite-Hite','HARDWARE','Dock Parts','EA',150,400,7,null,null,'["Loading Dock"]','dock,seal,head,pad'],
['DOCK-LIGHT-LED','Loading Dock Light LED Flexible Arm','LIGHT, DOCK, LED, FLEXIBLE ARM','Rite-Hite','ELECTRICAL','Dock Parts','EA',120,300,5,'{"type":"LED","arm":"flexible"}',null,'["Loading Dock"]','dock,light,led,flexible'],
['DOCK-HYD-CYL','Dock Leveler Hydraulic Cylinder','CYLINDER, HYDRAULIC, DOCK LEVELER','Rite-Hite','FLUID','Dock Parts','EA',200,500,7,null,'["Kelley","Serco"]','["DOCK_LEVELER"]','cylinder,hydraulic,dock,leveler'],
['DOCK-LIP-HINGE','Dock Leveler Lip Hinge Pin Set','HINGE PIN SET, DOCK LEVELER LIP','Rite-Hite','HARDWARE','Dock Parts','SET',30,75,3,null,null,'["DOCK_LEVELER"]','hinge,pin,lip,dock,leveler'],

// ── ADDITIONAL SAFETY ────────────────────────────────────────────────
['FIRE-EXTINGUISHER-ABC','Fire Extinguisher 10lb ABC Dry Chemical','EXTINGUISHER, FIRE, 10LB, ABC, DRY CHEMICAL','Amerex','SAFETY','Fire Protection','EA',50,120,2,'{"weight_lb":10,"class":"ABC"}','["Kidde","Badger"]','["All Areas"]','fire,extinguisher,abc,10lb'],
['FIRST-AID-KIT-50','First Aid Kit 50-Person OSHA','KIT, FIRST AID, 50-PERSON, OSHA COMPLIANT','Medline','SAFETY','First Aid','EA',40,90,2,null,null,'["All Areas"]','first,aid,kit,50,person,osha'],
['SPILL-KIT-CHEM','Chemical Spill Kit 30-Gallon Drum','KIT, SPILL, CHEMICAL, 30-GALLON DRUM','New Pig','SAFETY','Spill Control','EA',120,280,5,'{"capacity_gal":30}',null,'["Chemical Storage","CIP"]','spill,kit,chemical,drum'],
['EYEWASH-STATION','Emergency Eyewash Station Gravity-Fed 16gal','EYEWASH, EMERGENCY, GRAVITY, 16 GALLON','Bradley','SAFETY','Emergency','EA',150,350,5,'{"volume_gal":16,"type":"gravity"}','["Haws 7501","Encon 01052"]','["Chemical Areas","Lab"]','eyewash,emergency,station,gravity'],
['HARNESS-FULL-BODY','Full Body Safety Harness Universal','HARNESS, SAFETY, FULL BODY, UNIVERSAL','3M/DBI-Sala','SAFETY','Fall Protection','EA',80,200,3,null,'["MSA V-FORM","Honeywell Miller"]','["Elevated Work"]','harness,safety,fall,protection'],
['LANYARD-6FT','Shock-Absorbing Lanyard 6ft','LANYARD, SHOCK ABSORB, 6FT, SNAP HOOKS','3M/DBI-Sala','SAFETY','Fall Protection','EA',40,100,3,'{"length_ft":6}','["MSA V-SERIES"]','["Elevated Work"]','lanyard,shock,absorbing,6ft,fall'],

// ── MORE SEALS & GASKETS ─────────────────────────────────────────────
['APV-GK-N35','PHE Gasket APV N35 EPDM','GASKET, PHE, APV N35, EPDM','SPX FLOW','SEALS','PHE Gaskets','EA',30,85,5,null,null,'["HTST_PASTEURIZER","Heat Exchanger"]','gasket,plate,apv,n35,epdm'],
['ALFA-LAVAL-GK-M15M','PHE Gasket Alfa Laval M15-M EPDM','GASKET, PHE, ALFA LAVAL M15-M, EPDM','Alfa Laval','SEALS','PHE Gaskets','EA',35,95,5,null,null,'["HTST_PASTEURIZER"]','gasket,plate,alfa,laval,m15'],
['TRI-CLAMP-GASKET-60','Tri-Clamp Gasket 6.0in EPDM','GASKET, TRI-CLAMP, 6.0in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',5,15,1,'{"size_in":6}',null,'["Tank Outlet","Large Line"]','gasket,triclamp,6inch'],
['PUMP-SEAL-MECH-150','Mechanical Seal 1.500in Carbon/SiC/EPDM','SEAL, MECHANICAL, 1-1/2in, CARBON/SIC, DAIRY','John Crane','SEALS','Mechanical Seals','EA',140,400,7,'{"shaft_in":1.5}','["Flowserve 168"]','["Centrifugal Pump"]','seal,mechanical,1.5inch,dairy'],
['PARKER-2-032-E70','O-Ring 2-032 EPDM 70A (1-3/4 ID)','O-RING, 2-032, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',0.70,2.50,1,'{"id_in":1.75,"material":"EPDM"}',null,'["Dairy Valve","CIP"]','oring,epdm,032,sanitary'],
['PARKER-2-040-E70','O-Ring 2-040 EPDM 70A (2-1/2 ID)','O-RING, 2-040, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',1,3.50,1,'{"id_in":2.5}',null,'["Dairy Valve","Tank"]','oring,epdm,040'],
['PARKER-2-048-E70','O-Ring 2-048 EPDM 70A (4-1/2 ID)','O-RING, 2-048, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',2,6,1,'{"id_in":4.5}',null,'["Large Valve","Manway"]','oring,epdm,048,large'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 6: ${parts.length} parts seeded`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterParts GROUP BY Category ORDER BY c DESC').all();
console.log(`   📦 Total parts in catalog: ${total}`);
for (const c of cats) console.log(`      ${c.Category}: ${c.c}`);
db.close();
