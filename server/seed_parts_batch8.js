// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 8: FINAL PUSH TO 500+ (filling gaps across all categories)
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── ADDITIONAL MOTORS (fill the range) ───────────────────────────────
['BALDOR-EM3550T','AC Motor 1.5HP 3500RPM 143TC TEFC','MOTOR, AC, 1.5HP, 3500RPM, 143TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',290,460,3,'{"hp":1.5,"rpm":3500,"frame":"143TC"}',null,'["Pump","Mixer"]','motor,ac,1.5hp,3500rpm,143tc'],
['BALDOR-EM3714T','AC Motor 10HP 1770RPM 215TC ODP','MOTOR, AC, 10HP, 1770RPM, 215TC, ODP','Baldor/ABB','MOTORS','AC Motors','EA',650,1050,5,'{"hp":10,"encl":"ODP"}',null,'["Fan","Blower"]','motor,ac,10hp,odp'],
['BALDOR-EM4115T','AC Motor 50HP 1775RPM 326TC TEFC','MOTOR, AC, 50HP, 1775RPM, 326TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',2800,4600,14,'{"hp":50,"frame":"326TC"}',null,'["Compressor","Large Blower"]','motor,ac,50hp,326tc'],
['BALDOR-EM4400TS','AC Motor 100HP 1785RPM 405TS ODP','MOTOR, AC, 100HP, 1785RPM, 405TS, ODP','Baldor/ABB','MOTORS','AC Motors','EA',4800,8000,21,'{"hp":100,"frame":"405TS","encl":"ODP"}',null,'["Large Fan","Cooling Tower"]','motor,ac,100hp,odp'],
['WEG-0218ET3E145TC','WEG Motor 2HP 1750RPM 145TC TEFC','MOTOR, AC, 2HP, 1750RPM, 145TC, TEFC, WEG','WEG','MOTORS','AC Motors','EA',280,460,3,'{"hp":2}','["Baldor EM3558T"]','["Pump","Conveyor"]','motor,ac,weg,2hp,145tc'],
['WEG-0518ET3E184TC','WEG Motor 5HP 1750RPM 184TC TEFC','MOTOR, AC, 5HP, 1750RPM, 184TC, TEFC, WEG','WEG','MOTORS','AC Motors','EA',400,680,3,'{"hp":5}','["Baldor EM3615T"]','["Pump","Blower"]','motor,ac,weg,5hp,184tc'],

// ── MORE BEARINGS (fill common sizes) ────────────────────────────────
['SKF-6200-2RS','Deep Groove Ball Bearing 10x30x9mm Sealed','BEARING, BALL, 6200-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',3,10,1,'{"bore_mm":10,"od_mm":30}','["NTN 6200LLU"]','["Small Motor"]','bearing,ball,6200'],
['SKF-6214-2RS','Deep Groove Ball Bearing 70x125x24mm Sealed','BEARING, BALL, 6214-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',35,90,2,'{"bore_mm":70}',null,'["Large Motor"]','bearing,ball,6214'],
['SKF-6311-2RS','Deep Groove Ball Bearing 55x120x29mm Sealed','BEARING, BALL, 6311-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',28,75,2,'{"bore_mm":55}','["NTN 6311LLU"]','["Motor","Blower"]','bearing,ball,6311'],
['SKF-6314-2RS','Deep Groove Ball Bearing 70x150x35mm Sealed','BEARING, BALL, 6314-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',50,130,3,'{"bore_mm":70}',null,'["Large Motor"]','bearing,ball,6314'],
['DODGE-P2B-SC-104','Pillow Block Bearing 1-1/4in Bore','BEARING, PILLOW BLOCK, 1-1/4in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',30,72,2,'{"bore_in":1.25}',null,'["Conveyor"]','bearing,pillow,block,1.25inch'],
['DODGE-P2B-SC-108','Pillow Block Bearing 1-3/4in Bore','BEARING, PILLOW BLOCK, 1-3/4in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',42,95,2,'{"bore_in":1.75}',null,'["Conveyor","Mixer"]','bearing,pillow,block,1.75inch'],
['TIMKEN-SET4','Tapered Roller Bearing Set L44649/L44610','BEARING, TAPERED ROLLER, SET 4','Timken','BEARINGS','Tapered Roller','EA',12,30,1,null,null,'["Forklift","Conveyor"]','bearing,tapered,set4'],
['TIMKEN-SET17','Tapered Roller Bearing Set L68149/L68110','BEARING, TAPERED ROLLER, SET 17','Timken','BEARINGS','Tapered Roller','EA',14,35,1,null,'["NTN 4T-L68149/L68110"]','["Forklift"]','bearing,tapered,set17'],
['SKF-22214-E','Spherical Roller Bearing 70x125x31mm','BEARING, SPHERICAL ROLLER, 22214 E','SKF','BEARINGS','Spherical Roller','EA',70,180,3,'{"bore_mm":70}',null,'["Vibrating Screen","Crusher"]','bearing,spherical,22214'],
['SKF-22216-E','Spherical Roller Bearing 80x140x33mm','BEARING, SPHERICAL ROLLER, 22216 E','SKF','BEARINGS','Spherical Roller','EA',85,220,3,'{"bore_mm":80}',null,'["Large Gearbox"]','bearing,spherical,22216'],

// ── PLC / IO EXPANSION ───────────────────────────────────────────────
['AB-1769-IQ32','CompactLogix 32-Pt Digital Input Module','MODULE, DIGITAL INPUT, 32-PT, 1769-IQ32','Allen-Bradley','ELECTRICAL','PLC I/O','EA',250,450,3,'{"points":32}',null,'["Control Panel"]','plc,module,digital,input,32pt'],
['AB-1769-OB32','CompactLogix 32-Pt Digital Output Module','MODULE, DIGITAL OUTPUT, 32-PT, 1769-OB32','Allen-Bradley','ELECTRICAL','PLC I/O','EA',280,500,3,'{"points":32}',null,'["Control Panel"]','plc,module,digital,output,32pt'],
['AB-1769-IF8','CompactLogix 8-Ch Analog Input Module','MODULE, ANALOG INPUT, 8-CH, 1769-IF8','Allen-Bradley','ELECTRICAL','PLC I/O','EA',400,700,5,'{"channels":8}',null,'["Control Panel"]','plc,module,analog,input,8ch'],
['AB-1769-PA4','CompactLogix Power Supply 120/240VAC','POWER SUPPLY, PLC, 1769-PA4, 120/240VAC','Allen-Bradley','ELECTRICAL','PLC I/O','EA',120,220,3,null,null,'["PLC Rack"]','plc,power,supply,1769'],
['AB-1756-L73','ControlLogix 5570 L73 Controller 8MB','PLC, CONTROLLOGIX 5570, L73, 8MB','Allen-Bradley','ELECTRICAL','PLCs','EA',5000,8500,10,'{"memory":"8MB","series":"5570"}',null,'["Large System"]','plc,controllogix,l73,5570'],
['AB-2711P-T12','PanelView Plus 7 12in HMI Color Touch','HMI, PANELVIEW PLUS 7, 12in, COLOR TOUCH','Allen-Bradley','ELECTRICAL','HMIs','EA',2500,4000,7,'{"size_in":12}',null,'["Process Control"]','hmi,panelview,plus,12inch'],

// ── MORE PNEUMATICS ──────────────────────────────────────────────────
['SMC-CG5BN32-75','Air Cylinder 32mm Bore 75mm Stroke','CYLINDER, AIR, 32mm BORE, 75mm STROKE, SS','SMC','PNEUMATIC','Cylinders','EA',45,110,3,'{"bore_mm":32,"stroke_mm":75}','["Festo DSBC-32-75"]','["Filler","Labeler"]','cylinder,air,32mm,smc'],
['SMC-CG5BN50-125','Air Cylinder 50mm Bore 125mm Stroke','CYLINDER, AIR, 50mm BORE, 125mm STROKE, SS','SMC','PNEUMATIC','Cylinders','EA',70,170,3,'{"bore_mm":50,"stroke_mm":125}','["Festo DSBC-50-125"]','["Packaging"]','cylinder,air,50mm'],
['SMC-CG5BN80-200','Air Cylinder 80mm Bore 200mm Stroke','CYLINDER, AIR, 80mm BORE, 200mm STROKE','SMC','PNEUMATIC','Cylinders','EA',120,280,3,'{"bore_mm":80,"stroke_mm":200}',null,'["Case Erector","Heavy Duty"]','cylinder,air,80mm,large'],
['MANIFOLD-SMC-5ST','Solenoid Valve Manifold 5-Station','MANIFOLD, SOLENOID, 5-STATION, SMC','SMC','PNEUMATIC','Manifolds','EA',150,350,5,'{"stations":5}','["Festo VTUG"]','["Filler","Packaging"]','manifold,solenoid,5station'],
['MANIFOLD-SMC-10ST','Solenoid Valve Manifold 10-Station','MANIFOLD, SOLENOID, 10-STATION, SMC','SMC','PNEUMATIC','Manifolds','EA',280,600,5,'{"stations":10}','["Festo VTUG"]','["Large Machine"]','manifold,solenoid,10station'],
['AIR-HOSE-3/8-25','Air Hose 3/8in x 25ft Polyurethane','HOSE, AIR, 3/8in x 25FT, POLYURETHANE','Amflo','PNEUMATIC','Hoses','EA',15,35,1,null,null,'["Maintenance"]','hose,air,3/8,25ft'],
['QUICK-COUPLER-1/4','Air Quick Coupler Set 1/4 NPT Industrial','COUPLER, QUICK, AIR, 1/4 NPT, INDUSTRIAL','Milton','PNEUMATIC','Fittings','SET',8,20,1,null,null,'["Maintenance"]','coupler,quick,air,1/4'],

// ── ADDITIONAL SEALS ─────────────────────────────────────────────────
['PARKER-2-036-E70','O-Ring 2-036 EPDM 70A (2-1/4 ID)','O-RING, 2-036, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',0.90,3,1,'{"id_in":2.25}',null,'["Valve","Pump"]','oring,epdm,036'],
['PARKER-2-044-E70','O-Ring 2-044 EPDM 70A (3-1/2 ID)','O-RING, 2-044, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',1.50,4.50,1,'{"id_in":3.5}',null,'["Large Valve"]','oring,epdm,044'],
['PARKER-2-152-E70','O-Ring 2-152 EPDM 70A (3-1/2 OD Flange)','O-RING, 2-152, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',2,6,1,null,null,'["Flange"]','oring,epdm,152,flange'],
['TRI-CLAMP-GASKET-15-SIL','Tri-Clamp Gasket 1.5in Silicone','GASKET, TRI-CLAMP, 1.5in, SILICONE','Generic','SEALS','Sanitary Gaskets','EA',2,6,1,'{"material":"silicone"}',null,'["High Temp"]','gasket,triclamp,1.5,silicone'],
['TRI-CLAMP-GASKET-20-SIL','Tri-Clamp Gasket 2.0in Silicone','GASKET, TRI-CLAMP, 2.0in, SILICONE','Generic','SEALS','Sanitary Gaskets','EA',2.50,7,1,'{"material":"silicone"}',null,'["High Temp"]','gasket,triclamp,2,silicone'],
['TRI-CLAMP-GASKET-30-SIL','Tri-Clamp Gasket 3.0in Silicone','GASKET, TRI-CLAMP, 3.0in, SILICONE','Generic','SEALS','Sanitary Gaskets','EA',3,8,1,null,null,'["High Temp"]','gasket,triclamp,3,silicone'],
['GARLOCK-STYLE-9900','Garlock Style 9900 Gasket Sheet 1/16x60x60','GASKET SHEET, GARLOCK 9900, 1/16x60x60','Garlock','SEALS','Gasket Material','EA',40,100,3,null,null,'["General Flanges"]','gasket,sheet,garlock,9900'],
['PUMP-SEAL-MECH-200','Mechanical Seal 2.000in Carbon/SiC/Viton','SEAL, MECHANICAL, 2in, CARBON/SIC/VITON','John Crane','SEALS','Mechanical Seals','EA',180,500,7,'{"shaft_in":2}','["Flowserve 168"]','["Large Pump"]','seal,mechanical,2inch'],

// ── MORE FLUID/PROCESS ───────────────────────────────────────────────
['PRESSURE-GAUGE-100','Pressure Gauge 0-100 PSI 4in SS','GAUGE, PRESSURE, 0-100 PSI, 4in, SS','Ashcroft','FLUID','Gauges','EA',25,65,2,'{"range":"0-100","size_in":4,"material":"SS"}','["Wika","USG"]','["Utility","Process"]','gauge,pressure,0-100,4inch'],
['PRESSURE-GAUGE-200','Pressure Gauge 0-200 PSI 4in SS','GAUGE, PRESSURE, 0-200 PSI, 4in, SS','Ashcroft','FLUID','Gauges','EA',28,70,2,'{"range":"0-200"}','["Wika","USG"]','["Steam","Compressed Air"]','gauge,pressure,0-200'],
['PRESSURE-GAUGE-60','Pressure Gauge 0-60 PSI 2.5in SS Sanitary','GAUGE, PRESSURE, 0-60 PSI, 2.5in, SANITARY','Ashcroft','FLUID','Gauges','EA',35,85,2,'{"range":"0-60","connection":"tri-clamp"}',null,'["Process","HTST"]','gauge,pressure,sanitary,0-60'],
['TEMP-GAUGE-BIMETAL','Temperature Gauge Bi-Metal 0-250°F 5in','GAUGE, TEMPERATURE, BI-METAL, 0-250F, 5in','Ashcroft','FLUID','Gauges','EA',20,55,2,'{"range":"0-250F","type":"bi-metal"}','["Wika","Tel-Tru"]','["Tank","Pipe"]','gauge,temperature,bimetal,250f'],
['FLOW-SWITCH-PADDLE','Flow Switch Paddle Type 1in MNPT','SWITCH, FLOW, PADDLE, 1in, MNPT','Gems','FLUID','Flow Switches','EA',45,120,3,'{"size_in":1}','["McDonnell Miller FS4-3"]','["Pump Protection","CIP"]','switch,flow,paddle,1inch'],
['CHECK-VALVE-1-SS','Check Valve 1in Swing Type SS','VALVE, CHECK, 1in, SWING, SS','Watts','FLUID','Industrial Valves','EA',30,75,3,'{"size_in":1,"type":"swing","material":"SS"}',null,'["Pump Discharge"]','valve,check,1inch,swing,ss'],
['CHECK-VALVE-1.5-SS','Check Valve 1.5in Swing Type SS','VALVE, CHECK, 1.5in, SWING, SS','Watts','FLUID','Industrial Valves','EA',40,100,3,'{"size_in":1.5}',null,'["Pump Discharge"]','valve,check,1.5,swing'],
['GATE-VALVE-2-SS','Gate Valve 2in 150# Flanged SS','VALVE, GATE, 2in, 150#, FLANGED, SS','Watts','FLUID','Industrial Valves','EA',80,200,5,'{"size_in":2,"material":"SS"}',null,'["Utility","Isolation"]','valve,gate,2inch,flanged'],
['GLOBE-VALVE-1-SS','Globe Valve 1in 150# SS','VALVE, GLOBE, 1in, 150#, SS','Watts','FLUID','Industrial Valves','EA',50,130,5,null,null,'["Steam","Throttling"]','valve,globe,1inch,ss'],

// ── MORE FILTERS ─────────────────────────────────────────────────────
['AIR-FILTER-16x20x2','Pleated Air Filter 16x20x2 MERV 8','FILTER, AIR, 16x20x2, MERV 8','Generic','FILTERS','Air Filters','EA',4,11,1,null,null,'["HVAC_AHU"]','filter,air,16x20,merv8'],
['AIR-FILTER-16x25x2','Pleated Air Filter 16x25x2 MERV 8','FILTER, AIR, 16x25x2, MERV 8','Generic','FILTERS','Air Filters','EA',5,13,1,null,null,'["HVAC_AHU"]','filter,air,16x25'],
['AIR-FILTER-20x20x4','Pleated Air Filter 20x20x4 MERV 11','FILTER, AIR, 20x20x4, MERV 11','Generic','FILTERS','Air Filters','EA',10,25,1,'{"merv":11}',null,'["HVAC_AHU"]','filter,air,20x20x4,merv11'],
['HEPA-FILTER-24x24','HEPA Filter 24x24x12 99.97%','FILTER, HEPA, 24x24x12, 99.97%','Donaldson','FILTERS','HEPA','EA',120,300,7,'{"efficiency":"99.97%"}',null,'["Clean Room","Powder Room"]','filter,hepa,24x24'],
['BAG-FILTER-2x24-5PK','Bag Filter 2in x 24in 5-Micron (Pack/5)','FILTER BAG, 2x24, 5 MICRON, PACK/5','Pentek','FILTERS','Bag Filters','PK',15,35,2,'{"size":"2x24","micron":5,"qty":5}',null,'["Water Filter","Process"]','filter,bag,5micron,2x24'],
['CART-FILTER-10-5','Cartridge Filter 10in 5-Micron Sediment','FILTER, CARTRIDGE, 10in, 5 MICRON, SEDIMENT','Pentek','FILTERS','Cartridge Filters','EA',5,15,1,'{"length_in":10,"micron":5}',null,'["Water Pre-Filter"]','filter,cartridge,10,5micron'],
['CART-FILTER-20-1','Cartridge Filter 20in 1-Micron Sediment','FILTER, CARTRIDGE, 20in, 1 MICRON, SEDIMENT','Pentek','FILTERS','Cartridge Filters','EA',8,22,1,'{"length_in":20,"micron":1}',null,'["Water Filter"]','filter,cartridge,20,1micron'],

// ── LOGISTICS / FLEET ────────────────────────────────────────────────
['FORK-HYDRAULIC-OIL','Forklift Hydraulic Oil AW32 5-Gallon','OIL, HYDRAULIC, AW32, 5 GAL, FORKLIFT','Shell','LUBRICANTS','Forklift Parts','EA',30,65,2,'{"viscosity":"ISO 32"}',null,'["FORKLIFT_ELEC","FORKLIFT_LP"]','oil,hydraulic,forklift,aw32'],
['FORK-LP-TANK','LP Gas Tank 33.5lb (Forklift)','TANK, LP GAS, 33.5LB, FORKLIFT','Manchester','LOGISTICS','Forklift Parts','EA',80,180,3,'{"weight_lb":33.5}',null,'["FORKLIFT_LP"]','tank,lp,gas,propane,forklift'],
['FORK-SEAT-CUSHION','Forklift Seat Cushion Universal','SEAT, CUSHION, FORKLIFT, UNIVERSAL','Toyota','LOGISTICS','Forklift Parts','EA',60,150,5,null,null,'["FORKLIFT_ELEC","FORKLIFT_LP"]','seat,cushion,forklift'],
['FORK-HORN-BUTTON','Forklift Horn Button Assembly','HORN, BUTTON, FORKLIFT, ASSEMBLY','Generic','LOGISTICS','Forklift Parts','EA',10,25,2,null,null,'["All Forklifts"]','horn,button,forklift'],
['FORK-MIRROR-CONVEX','Forklift Rear View Mirror 8in Convex','MIRROR, REAR VIEW, 8in, CONVEX, FORKLIFT','Generic','LOGISTICS','Forklift Parts','EA',12,30,2,null,null,'["All Forklifts"]','mirror,convex,forklift'],
['FORK-LIGHT-HEAD','Forklift Headlight Assembly LED','LIGHT, HEAD, LED, FORKLIFT','Generic','LOGISTICS','Forklift Parts','EA',20,50,2,null,null,'["All Forklifts"]','headlight,led,forklift'],
['PALLET-JACK-SEAL','Pallet Jack Hydraulic Seal Kit','SEAL KIT, HYDRAULIC, PALLET JACK','Generic','LOGISTICS','Pallet Jack Parts','KIT',15,40,3,null,null,'["Pallet Jack"]','seal,kit,pallet,jack,hydraulic'],
['PALLET-JACK-WHEEL','Pallet Jack Steer Wheel Nylon 7x2','WHEEL, STEER, PALLET JACK, NYLON, 7x2','Generic','LOGISTICS','Pallet Jack Parts','EA',15,35,2,'{"size":"7x2","material":"nylon"}',null,'["Pallet Jack"]','wheel,steer,pallet,jack,nylon'],
['PALLET-JACK-LOAD','Pallet Jack Load Roller Nylon 3x3.75','ROLLER, LOAD, PALLET JACK, NYLON, 3x3.75','Generic','LOGISTICS','Pallet Jack Parts','EA',8,20,2,null,null,'["Pallet Jack"]','roller,load,pallet,jack'],

// ── ADDITIONAL LAB ───────────────────────────────────────────────────
['LAB-BUTTER-FAT','Babcock Butyrometer (Fat Test) Box/12','BUTYROMETER, BABCOCK, FAT TEST, BOX/12','Kimble','LAB','Lab Equipment','BX',30,70,3,'{"qty":12}',null,'["Lab","Fat Testing"]','butyrometer,babcock,fat,test'],
['LAB-ACID-SULFURIC','Sulfuric Acid Babcock 1-Gallon','ACID, SULFURIC, BABCOCK GRADE, 1 GAL','Fisher','LAB','Lab Chemicals','EA',20,45,3,null,null,'["Lab","Fat Testing"]','acid,sulfuric,babcock'],
['LAB-CENTRIFUGE','Babcock Centrifuge 24-Bottle','CENTRIFUGE, BABCOCK, 24-BOTTLE','Gerber','LAB','Lab Equipment','EA',800,2000,14,'{"capacity":24}',null,'["Lab"]','centrifuge,babcock,24bottle'],
['LAB-MOISTURE-ANALYZER','Moisture Analyzer Halogen','ANALYZER, MOISTURE, HALOGEN','Mettler Toledo','LAB','Lab Equipment','EA',2000,5000,14,null,null,'["Lab","Powder Testing"]','analyzer,moisture,halogen'],
['LAB-SCALE-PRECISION','Precision Scale 0.01g x 3200g','SCALE, PRECISION, 0.01g x 3200g','Mettler Toledo','LAB','Lab Equipment','EA',500,1200,7,'{"readability":"0.01g","capacity":"3200g"}','["A&D","Ohaus"]','["Lab"]','scale,precision,balance,lab'],
['LAB-INCUBATOR-32C','Incubator 32°C for Coliform/SPC','INCUBATOR, 32°C, COLIFORM/SPC','Fisher','LAB','Lab Equipment','EA',600,1500,10,'{"temp":"32°C"}',null,'["Lab"]','incubator,32c,coliform,lab'],
['LAB-SAMPLE-BOTTLE','Sterile Sample Bottle 4oz (Case/200)','BOTTLE, SAMPLE, STERILE, 4OZ, CASE/200','Nasco','LAB','Lab Consumables','CS',40,90,2,'{"size_oz":4,"qty":200}',null,'["Lab","Sampling"]','bottle,sample,sterile,lab'],

// ── CLEANING / SANITATION ────────────────────────────────────────────
['FOAM-GUN-SS','Foaming Gun Stainless Steel','GUN, FOAM, STAINLESS STEEL','Sani-Matic','HARDWARE','Sanitation','EA',200,500,5,'{"material":"SS"}','["Lafferty","Hydro Systems"]','["Sanitation"]','foam,gun,stainless,sanitation'],
['HOSE-REEL-3/4','Hose Reel 3/4in x 50ft SS','REEL, HOSE, 3/4in x 50FT, SS','Sani-Matic','HARDWARE','Sanitation','EA',300,700,7,null,null,'["Sanitation"]','hose,reel,3/4,stainless'],
['SQUEEGEE-24','Floor Squeegee 24in Rubber','SQUEEGEE, FLOOR, 24in, RUBBER','Vikan','HARDWARE','Sanitation','EA',15,35,1,'{"width_in":24}',null,'["All Areas"]','squeegee,floor,24inch,sanitation'],
['BRUSH-PIPE-2','Pipe Cleaning Brush 2in','BRUSH, PIPE, 2in, NYLON','Vikan','HARDWARE','Sanitation','EA',8,18,1,'{"size_in":2}',null,'["Sanitary Pipe"]','brush,pipe,2inch,sanitation'],
['MOP-BUCKET-35QT','Mop Bucket w/Wringer 35qt','BUCKET, MOP, 35QT, WITH WRINGER','Rubbermaid','HARDWARE','Sanitation','EA',40,90,2,null,null,'["All Areas"]','mop,bucket,wringer,35qt'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterParts GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏆🏆🏆 MILESTONE: ${total} PARTS IN CATALOG! 🏆🏆🏆`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
const equip = db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c;
const vend = db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c;
const warr = db.prepare('SELECT COUNT(*) as c FROM MasterWarrantyTemplates').get().c;
const xref = db.prepare('SELECT COUNT(*) as c FROM MasterCrossRef').get().c;
console.log(`\n   📦 Equipment: ${equip} | 🏢 Vendors: ${vend} | 🛡️ Warranties: ${warr} | 🔗 Xrefs: ${xref}`);
db.close();
