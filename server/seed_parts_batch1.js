// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 1: Bearings, Seals, Belts, Chains
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── BEARINGS ─────────────────────────────────────────────────────────
['SKF-6205-2RS','Deep Groove Ball Bearing 25x52x15mm Sealed','BEARING, BALL, 6205-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',8,25,1,'{"bore_mm":25,"od_mm":52,"width_mm":15,"seal":"2RS"}','["NTN 6205LLU","FAG 6205-C-2HRS","NSK 6205DDU","Timken 205PP"]','["Conveyor","Filler","Pump"]','bearing,ball,sealed,6205,metric'],
['SKF-6206-2RS','Deep Groove Ball Bearing 30x62x16mm Sealed','BEARING, BALL, 6206-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',10,30,1,'{"bore_mm":30,"od_mm":62,"width_mm":16}','["NTN 6206LLU","NSK 6206DDU","Timken 206PP"]','["Conveyor","Pump","Mixer"]','bearing,ball,sealed,6206'],
['SKF-6207-2RS','Deep Groove Ball Bearing 35x72x17mm Sealed','BEARING, BALL, 6207-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',12,35,1,'{"bore_mm":35,"od_mm":72,"width_mm":17}','["NTN 6207LLU","NSK 6207DDU"]','["Motor","Pump","Fan"]','bearing,ball,sealed,6207'],
['SKF-6208-2RS','Deep Groove Ball Bearing 40x80x18mm Sealed','BEARING, BALL, 6208-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',14,40,1,'{"bore_mm":40,"od_mm":80,"width_mm":18}','["NTN 6208LLU","NSK 6208DDU"]','["Motor","Gearbox","Fan"]','bearing,ball,sealed,6208'],
['SKF-6209-2RS','Deep Groove Ball Bearing 45x85x19mm Sealed','BEARING, BALL, 6209-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',16,45,1,'{"bore_mm":45,"od_mm":85,"width_mm":19}','["NTN 6209LLU","NSK 6209DDU"]','["Motor","Pump"]','bearing,ball,sealed,6209'],
['SKF-6210-2RS','Deep Groove Ball Bearing 50x90x20mm Sealed','BEARING, BALL, 6210-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',18,50,1,'{"bore_mm":50,"od_mm":90,"width_mm":20}','["NTN 6210LLU","NSK 6210DDU"]','["Motor","Gearbox"]','bearing,ball,sealed,6210'],
['SKF-6305-2RS','Deep Groove Ball Bearing 25x62x17mm Sealed','BEARING, BALL, 6305-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',10,28,1,'{"bore_mm":25,"od_mm":62,"width_mm":17}','["NTN 6305LLU","NSK 6305DDU"]','["Motor","Pump","Conveyor"]','bearing,ball,sealed,6305'],
['SKF-6306-2RS','Deep Groove Ball Bearing 30x72x19mm Sealed','BEARING, BALL, 6306-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',12,32,1,'{"bore_mm":30,"od_mm":72,"width_mm":19}','["NTN 6306LLU","NSK 6306DDU"]','["Motor","Pump"]','bearing,ball,sealed,6306'],
['SKF-6308-2RS','Deep Groove Ball Bearing 40x90x23mm Sealed','BEARING, BALL, 6308-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',18,55,1,'{"bore_mm":40,"od_mm":90,"width_mm":23}','["NTN 6308LLU","NSK 6308DDU"]','["Motor","Blower"]','bearing,ball,sealed,6308'],
['SKF-6310-2RS','Deep Groove Ball Bearing 50x110x27mm Sealed','BEARING, BALL, 6310-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',25,70,1,'{"bore_mm":50,"od_mm":110,"width_mm":27}','["NTN 6310LLU","NSK 6310DDU"]','["Motor","Blower","Compressor"]','bearing,ball,sealed,6310'],
// Pillow Block & Flange
['DODGE-P2B-SC-100','Pillow Block Bearing 1in Bore Set Screw','BEARING, PILLOW BLOCK, 1in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',25,60,2,'{"bore_in":1,"type":"pillow_block","mount":"set_screw"}','["SKF SY 1.TF","Browning VPS-116"]','["Conveyor","Mixer"]','bearing,pillow,block,mounted,1inch'],
['DODGE-P2B-SC-112','Pillow Block Bearing 1-1/2in Bore','BEARING, PILLOW BLOCK, 1-1/2in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',35,80,2,'{"bore_in":1.5}','["SKF SY 1-1/2.TF"]','["Conveyor","Shaft"]','bearing,pillow,block,1.5inch'],
['DODGE-P2B-SC-200','Pillow Block Bearing 2in Bore','BEARING, PILLOW BLOCK, 2in, SET SCREW','Dodge','BEARINGS','Mounted Units','EA',50,120,2,'{"bore_in":2}','["SKF SY 2.TF"]','["Conveyor","Mixer","Agitator"]','bearing,pillow,block,2inch'],
['DODGE-F4B-SC-100','4-Bolt Flange Bearing 1in Bore','BEARING, FLANGE, 4-BOLT, 1in','Dodge','BEARINGS','Mounted Units','EA',30,70,2,'{"bore_in":1,"type":"flange","bolts":4}','["SKF FY 1.TF"]','["Conveyor","Blower"]','bearing,flange,4bolt,1inch'],
// Tapered Roller
['TIMKEN-SET2','Tapered Roller Bearing Set LM11949/LM11910','BEARING, TAPERED ROLLER, SET 2','Timken','BEARINGS','Tapered Roller','EA',15,35,1,'{"cone":"LM11949","cup":"LM11910"}','["NTN 4T-LM11949/LM11910"]','["Forklift","Conveyor"]','bearing,tapered,roller,set2'],
['TIMKEN-SET3','Tapered Roller Bearing Set LM12649/LM12610','BEARING, TAPERED ROLLER, SET 3','Timken','BEARINGS','Tapered Roller','EA',18,40,1,null,'["NTN 4T-LM12649/LM12610"]','["Forklift","Conveyor"]','bearing,tapered,roller,set3'],
['TIMKEN-32007X','Tapered Roller Bearing 35x62x18mm Metric','BEARING, TAPERED ROLLER, 32007X','Timken','BEARINGS','Tapered Roller','EA',20,55,2,null,'["SKF 32007 X/Q","NTN 4T-32007X"]','["Gearbox","Pump"]','bearing,tapered,roller,32007,metric'],
// Spherical Roller
['SKF-22210-E','Spherical Roller Bearing 50x90x23mm','BEARING, SPHERICAL ROLLER, 22210 E','SKF','BEARINGS','Spherical Roller','EA',45,120,3,'{"bore_mm":50,"od_mm":90}','["FAG 22210-E1","NSK 22210CDE4"]','["Vibrating Screen","Crusher","Mixer"]','bearing,spherical,roller,22210'],
['SKF-22212-E','Spherical Roller Bearing 60x110x28mm','BEARING, SPHERICAL ROLLER, 22212 E','SKF','BEARINGS','Spherical Roller','EA',55,150,3,null,'["FAG 22212-E1","NSK 22212CDE4"]','["Gearbox","Mixer"]','bearing,spherical,roller,22212'],

// ── SEALS & GASKETS ──────────────────────────────────────────────────
['GARLOCK-21158-2687','Lip Seal 1.000x1.500x0.250 Nitrile','SEAL, LIP, 1.000x1.500x0.250, NITRILE','Garlock','SEALS','Lip Seals','EA',5,15,1,'{"shaft_in":1,"bore_in":1.5,"width_in":0.25,"material":"Nitrile"}','["SKF 10124","National 10124"]','["Pump","Motor","Gearbox"]','seal,lip,oil,nitrile,1inch'],
['GARLOCK-21158-3187','Lip Seal 1.250x1.750x0.312 Nitrile','SEAL, LIP, 1.250x1.750x0.312, NITRILE','Garlock','SEALS','Lip Seals','EA',6,18,1,null,'["SKF 12443"]','["Pump","Motor"]','seal,lip,oil,nitrile'],
['GARLOCK-21158-3750','Lip Seal 1.500x2.250x0.312 Viton','SEAL, LIP, 1.500x2.250x0.312, VITON','Garlock','SEALS','Lip Seals','EA',12,35,2,'{"material":"Viton/FKM"}','["SKF 15228"]','["Pump","Motor"]','seal,lip,viton,high-temp'],
['PARKER-2-012-N70','O-Ring 2-012 Buna-N 70A (1/2 ID)','O-RING, 2-012, BUNA-N, 70 DURO','Parker','SEALS','O-Rings','EA',0.25,1,1,'{"id_in":0.5,"cs_in":0.070,"duro":70,"material":"Buna-N"}','["Apple Rubber 2-012-N7"]','["Valve","Pump","Filler"]','oring,buna,012,sanitary'],
['PARKER-2-016-N70','O-Ring 2-016 Buna-N 70A (3/4 ID)','O-RING, 2-016, BUNA-N, 70 DURO','Parker','SEALS','O-Rings','EA',0.30,1.25,1,'{"id_in":0.75}',null,'["Valve","Pump","Filler"]','oring,buna,016'],
['PARKER-2-020-N70','O-Ring 2-020 Buna-N 70A (1in ID)','O-RING, 2-020, BUNA-N, 70 DURO','Parker','SEALS','O-Rings','EA',0.35,1.50,1,'{"id_in":1.0}',null,'["Valve","Pump","Coupling"]','oring,buna,020'],
['PARKER-2-024-E70','O-Ring 2-024 EPDM 70A (1-1/4 ID)','O-RING, 2-024, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',0.50,2,1,'{"id_in":1.25,"material":"EPDM"}',null,'["Dairy Valve","CIP","Heat Exchanger"]','oring,epdm,024,sanitary,dairy'],
['PARKER-2-028-E70','O-Ring 2-028 EPDM 70A (1-1/2 ID)','O-RING, 2-028, EPDM, 70 DURO','Parker','SEALS','O-Rings','EA',0.60,2.25,1,'{"id_in":1.5,"material":"EPDM"}',null,'["Dairy Valve","CIP"]','oring,epdm,028,sanitary'],
['ALFA-LAVAL-GK-M6M','Plate Heat Exchanger Gasket M6-M EPDM','GASKET, PHE, ALFA LAVAL M6-M, EPDM','Alfa Laval','SEALS','PHE Gaskets','EA',15,45,5,'{"model":"M6-M","material":"EPDM"}','["APV SR2 equivalent"]','["HTST_PASTEURIZER","Heat Exchanger"]','gasket,plate,heat,exchanger,alfa,laval,epdm'],
['ALFA-LAVAL-GK-M10M','Plate Heat Exchanger Gasket M10-M EPDM','GASKET, PHE, ALFA LAVAL M10-M, EPDM','Alfa Laval','SEALS','PHE Gaskets','EA',25,75,5,null,null,'["HTST_PASTEURIZER"]','gasket,plate,heat,exchanger,m10'],
['APV-GK-SR2','Plate Heat Exchanger Gasket APV SR2 EPDM','GASKET, PHE, APV SR2, EPDM','SPX FLOW','SEALS','PHE Gaskets','EA',20,60,5,null,null,'["HTST_PASTEURIZER"]','gasket,plate,apv,sr2'],
['TRI-CLAMP-GASKET-15','Tri-Clamp Gasket 1.5in EPDM','GASKET, TRI-CLAMP, 1.5in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',1,4,1,'{"size_in":1.5,"material":"EPDM"}',null,'["All Sanitary"]','gasket,triclamp,sanitary,1.5,epdm'],
['TRI-CLAMP-GASKET-20','Tri-Clamp Gasket 2.0in EPDM','GASKET, TRI-CLAMP, 2.0in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',1.25,5,1,'{"size_in":2}',null,'["All Sanitary"]','gasket,triclamp,2inch,epdm'],
['TRI-CLAMP-GASKET-25','Tri-Clamp Gasket 2.5in EPDM','GASKET, TRI-CLAMP, 2.5in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',1.50,6,1,'{"size_in":2.5}',null,'["All Sanitary"]','gasket,triclamp,2.5inch'],
['TRI-CLAMP-GASKET-30','Tri-Clamp Gasket 3.0in EPDM','GASKET, TRI-CLAMP, 3.0in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',2,7,1,'{"size_in":3}',null,'["All Sanitary"]','gasket,triclamp,3inch'],
['TRI-CLAMP-GASKET-40','Tri-Clamp Gasket 4.0in EPDM','GASKET, TRI-CLAMP, 4.0in, EPDM','Generic','SEALS','Sanitary Gaskets','EA',3,10,1,'{"size_in":4}',null,'["All Sanitary"]','gasket,triclamp,4inch'],
['PUMP-SEAL-MECH-100','Mechanical Seal 1.000in John Crane Type 21','SEAL, MECHANICAL, 1in, JOHN CRANE TYPE 21','John Crane','SEALS','Mechanical Seals','EA',85,250,5,'{"shaft_in":1,"type":"single_spring"}','["Flowserve 168","Chesterton 491"]','["Centrifugal Pump","CIP Pump"]','seal,mechanical,pump,1inch'],
['PUMP-SEAL-MECH-125','Mechanical Seal 1.250in Carbon/SiC/Viton','SEAL, MECHANICAL, 1-1/4in, CARBON/SIC','John Crane','SEALS','Mechanical Seals','EA',120,350,5,'{"shaft_in":1.25}','["Flowserve 168"]','["Centrifugal Pump"]','seal,mechanical,pump,1.25inch'],
['PUMP-SEAL-MECH-175','Mechanical Seal 1.750in Carbon/SiC/EPDM','SEAL, MECHANICAL, 1-3/4in, DAIRY GRADE','John Crane','SEALS','Mechanical Seals','EA',150,450,7,'{"shaft_in":1.75,"face":"Carbon/SiC","elastomer":"EPDM","dairy_grade":true}',null,'["Waukesha PD Pump","Fristam Pump"]','seal,mechanical,pump,dairy,sanitary'],

// ── BELTS ────────────────────────────────────────────────────────────
['GATES-A68','V-Belt A68 (4L700) Classical A Section','BELT, V, A68 (4L700), CLASSICAL','Gates','HARDWARE','V-Belts','EA',8,20,1,'{"section":"A","length_in":70}','["Browning A68","Dayco A68","Bando A68"]','["Motor","Blower","Pump"]','belt,v,a68,classical'],
['GATES-B75','V-Belt B75 (5L780) Classical B Section','BELT, V, B75 (5L780), CLASSICAL','Gates','HARDWARE','V-Belts','EA',12,28,1,'{"section":"B","length_in":78}','["Browning B75","Dayco B75"]','["Motor","Blower","Compressor"]','belt,v,b75,classical'],
['GATES-B81','V-Belt B81 Classical B Section','BELT, V, B81, CLASSICAL','Gates','HARDWARE','V-Belts','EA',14,30,1,'{"section":"B","length_in":84}','["Browning B81"]','["Motor","Blower"]','belt,v,b81'],
['GATES-3VX600','Cogged V-Belt 3VX600','BELT, V, 3VX600, COGGED','Gates','HARDWARE','V-Belts','EA',15,35,1,'{"section":"3VX","length_in":60}','["Browning 3VX600"]','["Motor","Pump"]','belt,v,cogged,3vx'],
['GATES-5M710','Synchronous/Timing Belt 5M-710-15mm','BELT, TIMING, 5M-710, 15mm WIDE','Gates','HARDWARE','Timing Belts','EA',18,45,2,'{"pitch":"5mm","length_mm":710,"width_mm":15}','["Browning 710-5M-15"]','["Filler","Conveyor","Labeler"]','belt,timing,synchronous,5m'],
['GATES-8M1200','Synchronous/Timing Belt 8M-1200-20mm','BELT, TIMING, 8M-1200, 20mm WIDE','Gates','HARDWARE','Timing Belts','EA',25,65,2,'{"pitch":"8mm","length_mm":1200,"width_mm":20}',null,'["Case Erector","Palletizer"]','belt,timing,8m'],

// ── CHAINS & SPROCKETS ───────────────────────────────────────────────
['REXNORD-40-1R-10','Roller Chain #40 Single Strand 10ft','CHAIN, ROLLER, #40, SINGLE, 10FT','Rexnord','HARDWARE','Roller Chain','EA',20,45,1,'{"pitch_in":0.5,"strand":"single","length_ft":10}','["Martin 40-1","Tsubaki RS40"]','["Conveyor","Case Erector"]','chain,roller,40,single'],
['REXNORD-50-1R-10','Roller Chain #50 Single Strand 10ft','CHAIN, ROLLER, #50, SINGLE, 10FT','Rexnord','HARDWARE','Roller Chain','EA',30,65,1,'{"pitch_in":0.625}','["Martin 50-1","Tsubaki RS50"]','["Conveyor","Palletizer"]','chain,roller,50,single'],
['REXNORD-60-1R-10','Roller Chain #60 Single Strand 10ft','CHAIN, ROLLER, #60, SINGLE, 10FT','Rexnord','HARDWARE','Roller Chain','EA',40,85,1,'{"pitch_in":0.75}','["Martin 60-1","Tsubaki RS60"]','["Conveyor","Large Drive"]','chain,roller,60,single'],
['MARTIN-40B18','Sprocket #40 18-Tooth B-Hub','SPROCKET, #40, 18T, B-HUB','Martin','HARDWARE','Sprockets','EA',12,30,2,'{"pitch":"40","teeth":18,"hub":"B"}',null,'["Conveyor"]','sprocket,40,18tooth'],
['MARTIN-50B20','Sprocket #50 20-Tooth B-Hub','SPROCKET, #50, 20T, B-HUB','Martin','HARDWARE','Sprockets','EA',18,45,2,'{"pitch":"50","teeth":20,"hub":"B"}',null,'["Conveyor"]','sprocket,50,20tooth'],
['REXNORD-TABLETOP-882','Table Top Chain 882 Series SS 10ft','CHAIN, TABLE TOP, 882 SERIES, SS, 10FT','Rexnord','HARDWARE','Table Top Chain','FT',25,60,3,'{"series":"882","material":"SS","width_in":3.25}','["Intralox S800"]','["Filler Conveyor","Case Conveyor"]','chain,tabletop,882,stainless,sanitary'],
['INTRALOX-S1100','Modular Belt S1100 Flush Grid 1ft','BELT, MODULAR, S1100, FLUSH GRID','Intralox','HARDWARE','Modular Belt','FT',35,80,5,'{"series":"S1100","type":"flush_grid"}',null,'["Filler","Conveyor","Packaging"]','belt,modular,intralox,s1100,flush'],

// ── FILTERS ──────────────────────────────────────────────────────────
['AIR-FILTER-20x20x2','Pleated Air Filter 20x20x2 MERV 8','FILTER, AIR, 20x20x2, MERV 8','Generic','FILTERS','Air Filters','EA',4,12,1,'{"size":"20x20x2","merv":8}',null,'["HVAC_AHU","Compressor Room"]','filter,air,pleated,merv8,20x20'],
['AIR-FILTER-20x25x2','Pleated Air Filter 20x25x2 MERV 8','FILTER, AIR, 20x25x2, MERV 8','Generic','FILTERS','Air Filters','EA',5,14,1,null,null,'["HVAC_AHU"]','filter,air,pleated,merv8,20x25'],
['AIR-FILTER-24x24x2','Pleated Air Filter 24x24x2 MERV 13','FILTER, AIR, 24x24x2, MERV 13','Generic','FILTERS','Air Filters','EA',8,22,1,'{"merv":13}',null,'["HVAC_AHU","Processing Area"]','filter,air,merv13,24x24'],
['ATLAS-DD120','Compressed Air Coalescing Filter Element DD120','FILTER, COALESCING, ATLAS COPCO DD120','Atlas Copco','FILTERS','Compressed Air','EA',35,90,3,null,'["Ingersoll 39312905"]','["AIR_COMPRESSOR"]','filter,coalescing,compressed,air,atlas'],
['ATLAS-PD120','Compressed Air Particulate Filter Element PD120','FILTER, PARTICULATE, ATLAS COPCO PD120','Atlas Copco','FILTERS','Compressed Air','EA',30,75,3,null,null,'["AIR_COMPRESSOR"]','filter,particulate,compressed,air'],
['MF-MEMBRANE-05','Microfiltration Membrane 0.5 Micron Dairy','MEMBRANE, MF, 0.5 MICRON, DAIRY GRADE','Koch Membrane','FILTERS','Membranes','EA',200,800,14,'{"pore_size_micron":0.5,"material":"PVDF"}',null,'["MEMBRANE_FILTER"]','membrane,microfiltration,dairy,0.5'],
['RO-MEMBRANE-BW','RO Membrane 4x40 Brackish Water','MEMBRANE, RO, 4x40, BW THIN FILM','Dow FilmTec','FILTERS','Membranes','EA',150,500,7,null,'["Hydranautics ESPA","Toray TMG"]','["MEMBRANE_FILTER"]','membrane,ro,reverse,osmosis,4x40'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 1: ${parts.length} parts seeded (Bearings, Seals, Belts, Chains, Filters)`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
console.log(`   📦 Total parts in catalog: ${total}`);
db.close();
