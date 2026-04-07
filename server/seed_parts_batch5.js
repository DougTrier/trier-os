// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 5: Expanded catalog - more bearings, motors, dairy-specific, packaging
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── MORE BEARINGS (common dairy sizes) ───────────────────────────────
['SKF-6201-2RS','Deep Groove Ball Bearing 12x32x10mm Sealed','BEARING, BALL, 6201-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',4,12,1,'{"bore_mm":12,"od_mm":32,"width_mm":10}','["NTN 6201LLU","NSK 6201DDU"]','["Small Pump","Filler"]','bearing,ball,6201'],
['SKF-6202-2RS','Deep Groove Ball Bearing 15x35x11mm Sealed','BEARING, BALL, 6202-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',5,14,1,'{"bore_mm":15,"od_mm":35,"width_mm":11}','["NTN 6202LLU","NSK 6202DDU"]','["Fan","Small Motor"]','bearing,ball,6202'],
['SKF-6211-2RS','Deep Groove Ball Bearing 55x100x21mm Sealed','BEARING, BALL, 6211-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',20,55,1,'{"bore_mm":55,"od_mm":100,"width_mm":21}','["NTN 6211LLU"]','["Motor","Pump"]','bearing,ball,6211'],
['SKF-6213-2RS','Deep Groove Ball Bearing 65x120x23mm Sealed','BEARING, BALL, 6213-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',30,80,2,'{"bore_mm":65}','["NTN 6213LLU"]','["Large Motor","Blower"]','bearing,ball,6213'],
['SKF-6307-2RS','Deep Groove Ball Bearing 35x80x21mm Sealed','BEARING, BALL, 6307-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',14,38,1,'{"bore_mm":35,"od_mm":80,"width_mm":21}','["NTN 6307LLU"]','["Motor","Pump"]','bearing,ball,6307'],
['SKF-6309-2RS','Deep Groove Ball Bearing 45x100x25mm Sealed','BEARING, BALL, 6309-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',22,60,1,'{"bore_mm":45,"od_mm":100}','["NTN 6309LLU"]','["Motor","Blower"]','bearing,ball,6309'],
['DODGE-P2B-SC-115','Pillow Block Bearing 1-15/16in Bore','BEARING, PILLOW BLOCK, 1-15/16in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',45,100,2,'{"bore_in":1.9375}','["SKF SY 1-15/16.TF"]','["Conveyor","Shaft"]','bearing,pillow,block,1-15/16'],
['DODGE-F4B-SC-112','4-Bolt Flange Bearing 1-1/2in','BEARING, FLANGE, 4-BOLT, 1-1/2in','Dodge','BEARINGS','Mounted Units','EA',40,90,2,'{"bore_in":1.5}','["SKF FY 1-1/2.TF"]','["Conveyor","Blower"]','bearing,flange,4bolt,1.5inch'],
['SKF-NU210-ECP','Cylindrical Roller Bearing NU210 50x90x20mm','BEARING, CYLINDRICAL ROLLER, NU210 ECP','SKF','BEARINGS','Cylindrical Roller','EA',40,110,3,'{"bore_mm":50,"od_mm":90}','["FAG NU210-E-TVP2"]','["Motor","Gearbox","Compressor"]','bearing,cylindrical,roller,nu210'],
['SKF-NU212-ECP','Cylindrical Roller Bearing NU212 60x110x22mm','BEARING, CYLINDRICAL ROLLER, NU212 ECP','SKF','BEARINGS','Cylindrical Roller','EA',50,140,3,'{"bore_mm":60}','["FAG NU212-E-TVP2"]','["Motor","Compressor"]','bearing,cylindrical,roller,nu212'],

// ── MORE MOTORS (common dairy HP ratings) ────────────────────────────
['BALDOR-EM3546T','AC Motor 1HP 1760RPM 143TC TEFC','MOTOR, AC, 1HP, 1760RPM, 143TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',240,380,3,'{"hp":1,"rpm":1760,"frame":"143TC","encl":"TEFC"}','["WEG 01018ET3E143TC"]','["Small Pump","Agitator"]','motor,ac,1hp,143tc'],
['BALDOR-EM3710T','AC Motor 7.5HP 1770RPM 215TC TEFC','MOTOR, AC, 7.5HP, 1770RPM, 215TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',620,1000,5,'{"hp":7.5,"frame":"215TC"}',null,'["Pump","Conveyor"]','motor,ac,7.5hp,215tc'],
['BALDOR-EM4100T','AC Motor 15HP 1775RPM 254TC ODP','MOTOR, AC, 15HP, 1775RPM, 254TC, ODP','Baldor/ABB','MOTORS','AC Motors','EA',800,1350,7,'{"hp":15,"encl":"ODP"}',null,'["Fan","Blower"]','motor,ac,15hp,254tc,odp'],
['BALDOR-EM4314T','AC Motor 60HP 1780RPM 364TC TEFC','MOTOR, AC, 60HP, 1780RPM, 364TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',3500,5800,14,'{"hp":60,"frame":"364TC"}',null,'["Compressor","Large Blower"]','motor,ac,60hp,364tc'],
['BALDOR-EM4316T','AC Motor 75HP 1780RPM 365TC TEFC','MOTOR, AC, 75HP, 1780RPM, 365TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',4200,7000,14,'{"hp":75,"frame":"365TC"}',null,'["Ammonia Compressor"]','motor,ac,75hp,365tc'],
['BALDOR-EM4400T','AC Motor 100HP 1785RPM 405TC TEFC','MOTOR, AC, 100HP, 1785RPM, 405TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',5500,9000,21,'{"hp":100,"frame":"405TC"}',null,'["Large Compressor","Chiller"]','motor,ac,100hp,405tc'],
['BALDOR-SS-5HP','Washdown Motor 5HP 1750RPM 184TC TENV SS','MOTOR, WASHDOWN, 5HP, 184TC, STAINLESS','Baldor/ABB','MOTORS','Washdown Motors','EA',1600,2800,10,'{"hp":5,"frame":"184TC","material":"SS"}',null,'["Filler","CIP Pump"]','motor,washdown,stainless,5hp'],
['BALDOR-SS-10HP','Washdown Motor 10HP 1770RPM 215TC TENV SS','MOTOR, WASHDOWN, 10HP, 215TC, STAINLESS','Baldor/ABB','MOTORS','Washdown Motors','EA',2400,4000,10,'{"hp":10,"frame":"215TC","material":"SS"}',null,'["CIP Pump","Process"]','motor,washdown,stainless,10hp'],

// ── DAIRY PROCESSING SPECIFIC ────────────────────────────────────────
['HTST-DIVERT-VALVE','HTST Flow Diversion Valve Assembly','VALVE, FLOW DIVERSION, HTST, COMPLETE ASSEMBLY','APV/SPX','FLUID','HTST Parts','EA',1500,4000,14,'{"type":"flow_diversion","3A_approved":true}',null,'["HTST_PASTEURIZER"]','valve,flow,diversion,htst,pasteurizer,3a'],
['HTST-TIMING-PUMP','HTST Timing Pump 3HP SS','PUMP, TIMING, HTST, 3HP, SS','Waukesha','FLUID','HTST Parts','EA',2500,5000,14,'{"hp":3,"type":"positive_displacement"}',null,'["HTST_PASTEURIZER"]','pump,timing,htst,pasteurizer'],
['HTST-HOLDING-TUBE','HTST Holding Tube Assembly','TUBE, HOLDING, HTST, SS, COMPLETE ASSEMBLY','Custom','FLUID','HTST Parts','EA',800,2500,21,'{"material":"316L SS","3A":true}',null,'["HTST_PASTEURIZER"]','holding,tube,htst,pasteurizer'],
['HTST-BOOSTER-PUMP','HTST Booster Pump 2HP Centrifugal SS','PUMP, BOOSTER, HTST, 2HP, CENTRIFUGAL, SS','Fristam','FLUID','HTST Parts','EA',1800,3500,10,null,null,'["HTST_PASTEURIZER"]','pump,booster,htst,centrifugal'],
['SEP-BOWL-DISC','Separator Bowl Disc (Set of 100)','DISC, SEPARATOR BOWL, SET/100, SS','GEA Westfalia','FLUID','Separator Parts','SET',800,2500,21,'{"quantity":100,"material":"316L SS"}',null,'["SEPARATOR"]','disc,separator,bowl,gea,westfalia'],
['SEP-SEAL-RING','Separator Seal Ring Assembly','SEAL RING, SEPARATOR, ASSEMBLY','GEA Westfalia','SEALS','Separator Parts','EA',200,600,14,null,null,'["SEPARATOR"]','seal,ring,separator,gea'],
['HOM-VALVE-SEAT','Homogenizer Valve Seat','VALVE SEAT, HOMOGENIZER, STELLITE','GEA Niro Soavi','FLUID','Homogenizer Parts','EA',350,900,14,'{"material":"Stellite"}','["SPX APV Seat"]','["HOMOGENIZER"]','valve,seat,homogenizer,stellite'],
['HOM-PLUNGER-SEAL','Homogenizer Plunger Seal Kit','SEAL KIT, PLUNGER, HOMOGENIZER','GEA Niro Soavi','SEALS','Homogenizer Parts','KIT',120,350,7,null,'["SPX APV Plunger Kit"]','["HOMOGENIZER"]','seal,plunger,homogenizer,kit'],
['HOM-IMPACT-RING','Homogenizer Impact Ring','RING, IMPACT, HOMOGENIZER, TUNGSTEN CARBIDE','GEA Niro Soavi','FLUID','Homogenizer Parts','EA',250,700,14,'{"material":"tungsten_carbide"}',null,'["HOMOGENIZER"]','impact,ring,homogenizer,tungsten'],
['CIP-CHEM-PUMP','CIP Chemical Metering Pump','PUMP, METERING, CIP CHEMICAL, DIAPHRAGM','Pulsafeeder','FLUID','CIP Parts','EA',350,800,7,'{"type":"diaphragm","capacity":"1-10 GPH"}','["LMI Milton Roy","ProMinent"]','["CIP_SYSTEM"]','pump,metering,chemical,cip,diaphragm'],
['CIP-CONDUCTIVITY','CIP Conductivity Probe/Transmitter','PROBE, CONDUCTIVITY, CIP, WITH TRANSMITTER','Endress+Hauser','ELECTRICAL','CIP Parts','EA',400,1100,7,'{"type":"conductivity","range":"0-200 mS/cm"}','["Hach GLI SC200"]','["CIP_SYSTEM"]','probe,conductivity,cip,transmitter'],
['TANK-AGITATOR-1HP','Tank Agitator 1HP SS Sanitary','AGITATOR, TANK, 1HP, SS, SANITARY','SPX FLOW','FLUID','Tank Equipment','EA',1200,2800,10,'{"hp":1,"material":"316L SS","seal":"double_mechanical"}',null,'["BATCH_PASTEURIZER","CHEESE_VAT","Tank"]','agitator,tank,1hp,sanitary'],
['TANK-AGITATOR-3HP','Tank Agitator 3HP SS Sanitary','AGITATOR, TANK, 3HP, SS, SANITARY','SPX FLOW','FLUID','Tank Equipment','EA',2200,4500,14,'{"hp":3}',null,'["Tank","Silo"]','agitator,tank,3hp,sanitary'],
['TANK-MANWAY-18','Tank Manway 18in Oval SS','MANWAY, TANK, 18in, OVAL, SS','Central States','HARDWARE','Tank Equipment','EA',300,700,7,'{"size_in":18,"shape":"oval","material":"316L SS"}',null,'["Tank","Silo"]','manway,tank,18,oval,sanitary'],

// ── PACKAGING CONSUMABLES & PARTS ────────────────────────────────────
['FILL-HEAD-GASKET','Filler Head Gasket Set (Pack of 12)','GASKET SET, FILLER HEAD, PACK/12','Evergreen','SEALS','Filler Parts','PK',35,80,3,'{"qty":12}',null,'["GALLON_FILLER","HALF_GAL_FILLER"]','gasket,filler,head,evergreen'],
['FILL-NOZZLE-GAL','Filler Nozzle Assembly Gallon','NOZZLE, FILLER, GALLON, COMPLETE','Evergreen','FLUID','Filler Parts','EA',150,400,7,null,null,'["GALLON_FILLER"]','nozzle,filler,gallon,evergreen'],
['CAP-TORQUE-HEAD','Cap Torque Head Assembly','HEAD, TORQUE, CAPPING, ASSEMBLY','Evergreen','HARDWARE','Filler Parts','EA',200,500,7,null,null,'["GALLON_FILLER"]','cap,torque,head,capping'],
['GLUE-NORDSON-5LB','Hot Melt Adhesive Pellets 5lb Box','ADHESIVE, HOT MELT, PELLETS, 5LB','Nordson','LUBRICANTS','Packaging Consumables','BX',25,55,1,null,'["Henkel Technomelt"]','["CASE_ERECTOR","CASE_PACKER"]','glue,hot,melt,adhesive,nordson'],
['GLUE-NOZZLE-NORDSON','Hot Melt Nozzle for Nordson H200','NOZZLE, HOT MELT, NORDSON H200','Nordson','HARDWARE','Packaging Parts','EA',15,40,3,null,null,'["CASE_ERECTOR"]','nozzle,hot,melt,nordson'],
['VACUUM-CUP-30MM','Vacuum Cup 30mm Silicone w/Fitting','CUP, VACUUM, 30mm, SILICONE, WITH FITTING','Piab','PNEUMATIC','Vacuum Components','EA',5,15,1,'{"diameter_mm":30,"material":"silicone"}','["Schmalz SPB 30","SMC ZP3"]','["PALLETIZER","CASE_PACKER"]','vacuum,cup,suction,30mm,silicone'],
['VACUUM-CUP-50MM','Vacuum Cup 50mm Silicone w/Fitting','CUP, VACUUM, 50mm, SILICONE, WITH FITTING','Piab','PNEUMATIC','Vacuum Components','EA',8,22,1,'{"diameter_mm":50}','["Schmalz SPB 50"]','["PALLETIZER"]','vacuum,cup,50mm'],
['VACUUM-CUP-75MM','Vacuum Cup 75mm Silicone Bellows','CUP, VACUUM, 75mm, BELLOWS, SILICONE','Piab','PNEUMATIC','Vacuum Components','EA',12,30,2,'{"diameter_mm":75,"type":"bellows"}',null,'["PALLETIZER","Pick-Place"]','vacuum,cup,75mm,bellows'],
['VACUUM-GENERATOR','Vacuum Generator Ejector 1/4 NPT','GENERATOR, VACUUM, EJECTOR, 1/4 NPT','Piab','PNEUMATIC','Vacuum Components','EA',45,120,3,null,'["SMC ZH07","Schmalz SCPM"]','["PALLETIZER","Pick-Place"]','vacuum,generator,ejector,pneumatic'],
['SHRINK-FILM-18','Shrink Film 18in 75ga Polyolefin (Roll)','FILM, SHRINK, 18in, 75GA, POLYOLEFIN, ROLL','Sealed Air','HARDWARE','Packaging Consumables','ROLL',30,65,2,'{"width_in":18,"gauge":75}',null,'["SHRINK_WRAPPER"]','film,shrink,polyolefin,18inch'],
['STRETCH-FILM-20','Stretch Wrap 20in 80ga Machine (Roll)','FILM, STRETCH, 20in, 80GA, MACHINE, ROLL','Berry Global','HARDWARE','Packaging Consumables','ROLL',25,55,2,'{"width_in":20,"gauge":80}',null,'["PALLET_WRAPPER"]','film,stretch,wrap,20inch,machine'],
['LABEL-ROLL-4x6','Pressure Sensitive Label 4x6in Roll/1000','LABEL, PS, 4x6in, ROLL/1000','Avery Dennison','HARDWARE','Packaging Consumables','ROLL',20,50,3,'{"size":"4x6in","qty":1000}',null,'["LABELER"]','label,pressure,sensitive,4x6,roll'],

// ── BOILER & STEAM ───────────────────────────────────────────────────
['BOILER-SIGHT-GLASS','Boiler Sight Glass Assembly','SIGHT GLASS, BOILER, ASSEMBLY','Cleaver-Brooks','HARDWARE','Boiler Parts','EA',80,200,5,null,null,'["BOILER"]','sight,glass,boiler'],
['BOILER-GASKET-KIT','Boiler Handhole/Manhole Gasket Kit','GASKET KIT, BOILER, HANDHOLE/MANHOLE','Cleaver-Brooks','SEALS','Boiler Parts','KIT',40,100,3,null,null,'["BOILER"]','gasket,boiler,handhole,manhole'],
['BOILER-IGNITOR','Boiler Ignitor Electrode','IGNITOR, ELECTRODE, BOILER','Cleaver-Brooks','ELECTRICAL','Boiler Parts','EA',35,90,3,null,'["Honeywell Q347"]','["BOILER"]','ignitor,electrode,boiler'],
['BOILER-FLAME-ROD','Flame Rod Sensor','SENSOR, FLAME ROD, BOILER','Honeywell','ELECTRICAL','Boiler Parts','EA',25,65,2,null,null,'["BOILER"]','flame,rod,sensor,boiler'],
['BOILER-LWCO','Low Water Cutoff Switch McDonnell Miller','SWITCH, LOW WATER CUTOFF, MCDONNELL MILLER','McDonnell Miller','ELECTRICAL','Boiler Parts','EA',120,350,5,'{"type":"McDonnell_Miller_150S"}',null,'["BOILER"]','low,water,cutoff,lwco,boiler,mcdonnell'],
['STEAM-TRAP-3/4','Steam Trap 3/4in Inverted Bucket','TRAP, STEAM, 3/4in, INVERTED BUCKET','Armstrong','FLUID','Steam','EA',80,200,3,'{"size_in":0.75,"type":"inverted_bucket"}','["Spirax Sarco"]','["BOILER","Steam Distribution"]','steam,trap,inverted,bucket,3/4'],
['STEAM-TRAP-1','Steam Trap 1in Inverted Bucket','TRAP, STEAM, 1in, INVERTED BUCKET','Armstrong','FLUID','Steam','EA',100,280,3,'{"size_in":1}','["Spirax Sarco"]','["BOILER","Steam Distribution"]','steam,trap,1inch'],
['STEAM-PRV-3/4','Pressure Relief Valve 3/4in 150 PSI','VALVE, RELIEF, 3/4in, 150 PSI, STEAM','Kunkle','FLUID','Steam','EA',60,160,5,'{"size_in":0.75,"set_psi":150}','["Watts 174A"]','["BOILER"]','valve,relief,pressure,steam,safety'],
['STRAINER-Y-3/4','Y-Strainer 3/4in 150# SS','STRAINER, Y, 3/4in, 150#, SS','Watts','FLUID','Steam','EA',30,75,3,null,null,'["Steam","Water","CIP"]','strainer,y,3/4,stainless'],
['STRAINER-Y-1','Y-Strainer 1in 150# SS','STRAINER, Y, 1in, 150#, SS','Watts','FLUID','Steam','EA',40,95,3,null,null,'["Steam","Water"]','strainer,y,1inch'],

// ── AMMONIA REFRIGERATION ────────────────────────────────────────────
['NH3-VALVE-KING','Ammonia King Valve 2in Welded','VALVE, KING, AMMONIA, 2in, WELDED','Hansen','FLUID','Refrigeration','EA',250,600,7,'{"size_in":2,"refrigerant":"NH3"}',null,'["AMMONIA_SYSTEM"]','valve,king,ammonia,hansen'],
['NH3-SOLENOID-3/4','Ammonia Solenoid Valve 3/4in','VALVE, SOLENOID, AMMONIA, 3/4in','Parker/Sporlan','FLUID','Refrigeration','EA',180,450,5,'{"size_in":0.75}',null,'["AMMONIA_SYSTEM","CHILLER"]','valve,solenoid,ammonia,sporlan'],
['NH3-TXV-10TON','Ammonia TXV Expansion Valve 10-Ton','VALVE, EXPANSION, TXV, AMMONIA, 10-TON','Parker/Sporlan','FLUID','Refrigeration','EA',300,750,7,'{"capacity_ton":10}',null,'["AMMONIA_SYSTEM","CHILLER"]','valve,expansion,txv,ammonia'],
['NH3-OIL-5GAL','Ammonia Compressor Oil 5-Gallon','OIL, COMPRESSOR, AMMONIA GRADE, 5 GAL','CPI','LUBRICANTS','Refrigeration','EA',60,130,3,'{"grade":"ammonia_compatible"}',null,'["AMMONIA_SYSTEM"]','oil,compressor,ammonia,refrigeration'],
['NH3-DETECTOR','Ammonia Gas Detector Fixed Mount','DETECTOR, AMMONIA GAS, FIXED MOUNT, 0-500 PPM','Honeywell/MSA','SAFETY','Refrigeration','EA',800,2200,10,'{"range":"0-500 ppm","output":"4-20mA + relay"}',null,'["AMMONIA_SYSTEM"]','detector,ammonia,gas,safety,nh3'],
['NH3-LEAK-SNIFFER','Ammonia Leak Detector Portable','DETECTOR, AMMONIA LEAK, PORTABLE, HANDHELD','Bacharach','SAFETY','Refrigeration','EA',250,600,5,null,null,'["AMMONIA_SYSTEM"]','detector,ammonia,leak,portable'],

// ── WATER TREATMENT ──────────────────────────────────────────────────
['WT-SOFTENER-RESIN','Water Softener Resin 1 Cu.Ft.','RESIN, WATER SOFTENER, CATION, 1 CU.FT.','Purolite','FILTERS','Water Treatment','BAG',80,180,5,'{"volume":"1 cu.ft.","type":"cation_exchange"}',null,'["Water Softener"]','resin,water,softener,cation'],
['WT-CARBON-FILTER','Activated Carbon Filter Cartridge 20in','FILTER, CARBON, ACTIVATED, 20in','Pentek','FILTERS','Water Treatment','EA',15,40,2,'{"length_in":20,"type":"activated_carbon"}',null,'["Water Filter"]','filter,carbon,activated,water'],
['WT-UV-LAMP','UV Disinfection Lamp 254nm','LAMP, UV, DISINFECTION, 254nm','Trojan','ELECTRICAL','Water Treatment','EA',80,200,5,'{"wavelength":"254nm"}',null,'["UV System"]','lamp,uv,disinfection,water'],
['WT-CHLORINE-TEST','Chlorine Test Kit DPD','KIT, TEST, CHLORINE, DPD','Hach','LAB','Water Treatment','KIT',25,60,2,null,null,'["Water Treatment"]','test,kit,chlorine,dpd,water'],

// ── LAB & TEST EQUIPMENT ─────────────────────────────────────────────
['LAB-CRYO-SCOPE','Cryoscope Calibration Solution','SOLUTION, CALIBRATION, CRYOSCOPE','FOSS','LAB','Lab Consumables','EA',30,75,5,null,null,'["MILKOSCAN","Lab"]','calibration,solution,cryoscope,lab'],
['LAB-SOMATIC-REAGENT','Somatic Cell Count Reagent Kit','REAGENT KIT, SOMATIC CELL COUNT','FOSS','LAB','Lab Consumables','KIT',120,300,7,null,null,'["Lab","SCC Counter"]','reagent,somatic,cell,count,lab'],
['LAB-ANTIBIO-TEST','Antibiotic Residue Test Kit (25 tests)','TEST KIT, ANTIBIOTIC RESIDUE, 25-TEST','Neogen/IDEXX','LAB','Lab Consumables','KIT',80,180,3,'{"tests":25}',null,'["Lab","Receiving"]','test,kit,antibiotic,residue,dairy'],
['LAB-BACTOSCAN','BactoScan Reagent Cartridge','REAGENT, BACTOSCAN, CARTRIDGE','FOSS','LAB','Lab Consumables','EA',200,500,7,null,null,'["Lab","BactoScan"]','reagent,bactoscan,bacteria,count'],
['LAB-COLIFORM-PLATE','Coliform Test Petrifilm (Box/50)','PETRIFILM, COLIFORM, BOX/50','3M','LAB','Lab Consumables','BX',45,100,2,'{"qty":50}',null,'["Lab","Environmental"]','petrifilm,coliform,test,3m,lab'],
['LAB-THERMOMETER-CAL','Calibrated Reference Thermometer NIST','THERMOMETER, REFERENCE, CALIBRATED, NIST TRACEABLE','Fisherbrand','LAB','Lab Equipment','EA',60,150,5,'{"accuracy":"±0.1°C","nist":true}',null,'["Lab","HTST Verification"]','thermometer,calibrated,nist,reference'],

// ── COMPRESSOR PARTS ─────────────────────────────────────────────────
['COMP-OIL-SEP','Compressor Oil Separator Element','ELEMENT, OIL SEPARATOR, ROTARY SCREW COMPRESSOR','Atlas Copco','FILTERS','Compressor Parts','EA',80,250,5,null,'["Ingersoll 39737473","Kaeser 6.3789.0"]','["AIR_COMPRESSOR"]','oil,separator,element,compressor'],
['COMP-AIR-FILTER','Compressor Intake Air Filter Element','FILTER, INTAKE AIR, ROTARY SCREW COMPRESSOR','Atlas Copco','FILTERS','Compressor Parts','EA',25,70,3,null,'["Ingersoll 39708466"]','["AIR_COMPRESSOR"]','filter,intake,air,compressor'],
['COMP-OIL-FILTER','Compressor Oil Filter Element','FILTER, OIL, ROTARY SCREW COMPRESSOR','Atlas Copco','FILTERS','Compressor Parts','EA',20,55,3,null,'["Ingersoll 39329602"]','["AIR_COMPRESSOR"]','filter,oil,compressor'],
['COMP-BELT-SET','Compressor Drive Belt Set','BELT SET, DRIVER, ROTARY SCREW COMPRESSOR','Gates','HARDWARE','Compressor Parts','SET',35,90,3,null,null,'["AIR_COMPRESSOR"]','belt,set,compressor,drive'],
['DRYER-DESICCANT','Compressed Air Dryer Desiccant (50lb)','DESICCANT, COMPRESSED AIR DRYER, 50LB','Hankison','FILTERS','Compressor Parts','BAG',60,140,5,'{"weight_lb":50,"type":"activated_alumina"}',null,'["Compressed Air Dryer"]','desiccant,dryer,compressed,air'],
['DRAIN-AUTO-1/2','Auto Drain Valve 1/2in Timer','DRAIN, AUTOMATIC, 1/2in, TIMER','Armstrong','PNEUMATIC','Compressor Parts','EA',40,100,3,'{"size_in":0.5}',null,'["AIR_COMPRESSOR","Receiver"]','drain,automatic,timer,compressor'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 5: ${parts.length} parts seeded`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterParts GROUP BY Category ORDER BY c DESC').all();
console.log(`   📦 Total parts in catalog: ${total}`);
console.log(`   📊 By category:`);
for (const c of cats) console.log(`      ${c.Category}: ${c.c}`);
db.close();
