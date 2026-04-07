// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 3: Sanitary Fittings, Lubricants, Chemicals, Safety, Electrical, Hardware
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── SANITARY FITTINGS ────────────────────────────────────────────────
['TRI-CLAMP-15','Tri-Clamp 1.5in Heavy Duty 304 SS','CLAMP, TRI, 1.5in, HEAVY DUTY, 304 SS','Central States','HARDWARE','Sanitary Fittings','EA',8,22,1,'{"size_in":1.5,"material":"304 SS"}',null,'["All Dairy Process"]','clamp,triclamp,sanitary,1.5'],
['TRI-CLAMP-20','Tri-Clamp 2.0in Heavy Duty 304 SS','CLAMP, TRI, 2.0in, HEAVY DUTY, 304 SS','Central States','HARDWARE','Sanitary Fittings','EA',10,28,1,'{"size_in":2}',null,'["All Dairy Process"]','clamp,triclamp,2inch'],
['TRI-CLAMP-25','Tri-Clamp 2.5in Heavy Duty 304 SS','CLAMP, TRI, 2.5in, HEAVY DUTY, 304 SS','Central States','HARDWARE','Sanitary Fittings','EA',12,32,1,'{"size_in":2.5}',null,'["All Dairy Process"]','clamp,triclamp,2.5inch'],
['TRI-CLAMP-30','Tri-Clamp 3.0in Heavy Duty 304 SS','CLAMP, TRI, 3.0in, HEAVY DUTY, 304 SS','Central States','HARDWARE','Sanitary Fittings','EA',14,38,1,'{"size_in":3}',null,'["All Dairy Process"]','clamp,triclamp,3inch'],
['TRI-CLAMP-40','Tri-Clamp 4.0in Heavy Duty 304 SS','CLAMP, TRI, 4.0in, HEAVY DUTY, 304 SS','Central States','HARDWARE','Sanitary Fittings','EA',18,48,1,'{"size_in":4}',null,'["All Dairy Process"]','clamp,triclamp,4inch'],
['SAN-ELBOW-15-90','Sanitary 90° Elbow 1.5in Weld 316L SS','ELBOW, 90°, 1.5in, WELD, 316L SS, SANITARY','Central States','HARDWARE','Sanitary Fittings','EA',12,35,2,'{"angle":90,"size_in":1.5,"connection":"weld"}',null,'["All Dairy"]','elbow,90,sanitary,1.5,weld'],
['SAN-ELBOW-20-90','Sanitary 90° Elbow 2.0in Weld 316L SS','ELBOW, 90°, 2.0in, WELD, 316L SS, SANITARY','Central States','HARDWARE','Sanitary Fittings','EA',15,42,2,null,null,'["All Dairy"]','elbow,90,sanitary,2inch'],
['SAN-ELBOW-30-90','Sanitary 90° Elbow 3.0in Weld 316L SS','ELBOW, 90°, 3.0in, WELD, 316L SS, SANITARY','Central States','HARDWARE','Sanitary Fittings','EA',22,58,2,null,null,'["All Dairy"]','elbow,90,sanitary,3inch'],
['SAN-TEE-15','Sanitary Tee 1.5in Weld 316L SS','TEE, 1.5in, WELD, 316L SS, SANITARY','Central States','HARDWARE','Sanitary Fittings','EA',18,48,2,null,null,'["All Dairy"]','tee,sanitary,1.5,weld'],
['SAN-TEE-20','Sanitary Tee 2.0in Weld 316L SS','TEE, 2.0in, WELD, 316L SS, SANITARY','Central States','HARDWARE','Sanitary Fittings','EA',22,58,2,null,null,'["All Dairy"]','tee,sanitary,2inch'],
['SAN-TUBE-15-20FT','Sanitary Tubing 1.5in OD 316L SS 20ft','TUBING, SANITARY, 1.5in OD, 316L SS, 20FT','Central States','HARDWARE','Sanitary Tubing','EA',60,140,3,'{"od_in":1.5,"material":"316L SS","length_ft":20,"finish":"Ra 25"}',null,'["All Dairy"]','tubing,sanitary,stainless,1.5,316L'],
['SAN-TUBE-20-20FT','Sanitary Tubing 2.0in OD 316L SS 20ft','TUBING, SANITARY, 2.0in OD, 316L SS, 20FT','Central States','HARDWARE','Sanitary Tubing','EA',80,180,3,'{"od_in":2}',null,'["All Dairy"]','tubing,sanitary,2inch,316L'],
['SAN-TUBE-30-20FT','Sanitary Tubing 3.0in OD 316L SS 20ft','TUBING, SANITARY, 3.0in OD, 316L SS, 20FT','Central States','HARDWARE','Sanitary Tubing','EA',120,260,3,'{"od_in":3}',null,'["All Dairy"]','tubing,sanitary,3inch'],
['SAN-SPRAYBALL-15','Spray Ball 1.5in Tri-Clamp 316L SS','SPRAY BALL, 1.5in, TRI-CLAMP, 316L SS','Central States','HARDWARE','CIP Components','EA',25,65,3,'{"size_in":1.5,"pattern":"360°"}',null,'["CIP_SYSTEM","Tank"]','sprayball,cip,sanitary,1.5'],
['SAN-SPRAYBALL-20','Spray Ball 2.0in Tri-Clamp 316L SS','SPRAY BALL, 2.0in, TRI-CLAMP, 316L SS','Central States','HARDWARE','CIP Components','EA',30,80,3,null,null,'["CIP_SYSTEM","Tank"]','sprayball,cip,2inch'],

// ── CIP CHEMICALS ────────────────────────────────────────────────────
['ECOLAB-CAUSTIC-55','CIP Caustic (NaOH) 50% 55-Gallon Drum','CHEMICAL, CAUSTIC SODA 50%, 55 GAL DRUM','Ecolab','LUBRICANTS','CIP Chemicals','DRUM',180,350,3,'{"concentration":"50%","chemical":"NaOH"}','["Diversey Caustic","Zep Caustic"]','["CIP_SYSTEM"]','chemical,caustic,naoh,cip,55gal'],
['ECOLAB-ACID-55','CIP Phosphoric Acid 75% 55-Gallon Drum','CHEMICAL, PHOSPHORIC ACID 75%, 55 GAL DRUM','Ecolab','LUBRICANTS','CIP Chemicals','DRUM',220,420,3,'{"concentration":"75%","chemical":"H3PO4"}','["Diversey Acid"]','["CIP_SYSTEM"]','chemical,acid,phosphoric,cip,55gal'],
['ECOLAB-SANITIZER-55','Peracetic Acid Sanitizer 55-Gallon Drum','CHEMICAL, PERACETIC ACID SANITIZER, 55 GAL','Ecolab','LUBRICANTS','CIP Chemicals','DRUM',250,480,3,'{"chemical":"PAA"}','["Diversey Divosan"]','["CIP_SYSTEM","Filler"]','chemical,sanitizer,peracetic,paa,cip'],
['ECOLAB-CHLOR-5GAL','Chlorinated Alkaline CIP Cleaner 5-Gallon','CHEMICAL, CHLORINATED ALKALINE, 5 GAL','Ecolab','LUBRICANTS','CIP Chemicals','EA',45,90,1,null,null,'["CIP_SYSTEM"]','chemical,chlorinated,alkaline,cip'],

// ── LUBRICANTS ───────────────────────────────────────────────────────
['LUBE-EP2-35LB','Grease EP2 Lithium Complex 35lb Pail','GREASE, EP2, LITHIUM COMPLEX, 35LB PAIL','Shell','LUBRICANTS','Grease','EA',65,120,2,'{"grade":"EP2","base":"lithium_complex","nlgi":2}','["Mobil Mobilith SHC 100","Chevron Delo EP2"]','["Bearings","Motors","Conveyors"]','grease,ep2,lithium,35lb,pail'],
['LUBE-EP2-CART','Grease EP2 Lithium Complex 14oz Cartridge','GREASE, EP2, LITHIUM COMPLEX, 14OZ CARTRIDGE','Shell','LUBRICANTS','Grease','EA',5,12,1,'{"size_oz":14}','["Mobil Mobilith","Chevron Delo"]','["Bearings"]','grease,ep2,cartridge,14oz'],
['LUBE-FOOD-H1-CART','Food Grade H1 Grease 14oz Cartridge','GREASE, FOOD GRADE H1, 14OZ CARTRIDGE','Petro-Canada','LUBRICANTS','Food Grade','EA',10,25,2,'{"grade":"H1","nsfRegistered":true}','["Lubriplate FGL-1","CRC Food Grade"]','["All Dairy Process","Filler","Conveyor"]','grease,food,grade,h1,nsf,dairy'],
['LUBE-FOOD-H1-35LB','Food Grade H1 Grease 35lb Pail','GREASE, FOOD GRADE H1, 35LB PAIL','Petro-Canada','LUBRICANTS','Food Grade','EA',120,250,3,'{"grade":"H1","nsfRegistered":true}',null,'["All Dairy Process"]','grease,food,grade,h1,35lb'],
['LUBE-CHAIN-FOOD','Food Grade Chain Lubricant Spray 12oz','LUBRICANT, CHAIN, FOOD GRADE, SPRAY, 12OZ','CRC','LUBRICANTS','Food Grade','EA',8,18,1,'{"type":"spray","grade":"H1"}',null,'["Conveyor Chain","Packaging"]','lubricant,chain,food,grade,spray'],
['LUBE-COMP-OIL-5GAL','Compressor Oil ISO 46 5-Gallon','OIL, COMPRESSOR, ISO 46, 5 GAL','Shell','LUBRICANTS','Oils','EA',40,85,2,'{"viscosity":"ISO 46"}','["Mobil Rarus 427","Ingersoll Rand Ultra Plus"]','["AIR_COMPRESSOR"]','oil,compressor,iso46,5gal'],
['LUBE-GEAR-OIL-5GAL','Gear Oil ISO 220 5-Gallon','OIL, GEAR, ISO 220, 5 GAL','Shell','LUBRICANTS','Oils','EA',50,100,2,'{"viscosity":"ISO 220"}','["Mobil Mobilgear 600 XP 220","Chevron Meropa 220"]','["Gearbox","Reducer"]','oil,gear,iso220,5gal'],
['LUBE-HYDRAULIC-5GAL','Hydraulic Oil AW46 5-Gallon','OIL, HYDRAULIC, AW46, 5 GAL','Shell','LUBRICANTS','Oils','EA',35,75,2,'{"viscosity":"ISO 46","type":"anti-wear"}','["Mobil DTE 25","Chevron Rando HDZ 46"]','["Forklift","Dock Leveler","Hydraulic Press"]','oil,hydraulic,aw46,5gal'],

// ── ELECTRICAL MISC ──────────────────────────────────────────────────
['FUSE-ATDR-15','Time Delay Fuse 15A 600V Class CC','FUSE, TIME DELAY, 15A, 600V, CLASS CC','Mersen/Ferraz','ELECTRICAL','Fuses','EA',8,22,1,'{"amps":15,"voltage":600,"class":"CC","type":"time_delay"}','["Bussmann FNQ-R-15","Littelfuse CCMR-15"]','["MCC","VFD","Control Panel"]','fuse,time,delay,15a,class,cc'],
['FUSE-ATDR-30','Time Delay Fuse 30A 600V Class RK5','FUSE, TIME DELAY, 30A, 600V, CLASS RK5','Mersen/Ferraz','ELECTRICAL','Fuses','EA',12,30,1,'{"amps":30,"class":"RK5"}','["Bussmann FRN-R-30"]','["MCC","Disconnect"]','fuse,time,delay,30a,rk5'],
['CB-20A-2P','Circuit Breaker 20A 2-Pole 240V','BREAKER, CIRCUIT, 20A, 2-POLE, 240V','Square D','ELECTRICAL','Circuit Breakers','EA',15,40,1,'{"amps":20,"poles":2}','["Eaton BR220","Siemens Q220"]','["Panel","MCC"]','breaker,circuit,20a,2pole'],
['CB-30A-3P','Circuit Breaker 30A 3-Pole 480V','BREAKER, CIRCUIT, 30A, 3-POLE, 480V','Square D','ELECTRICAL','Circuit Breakers','EA',35,80,2,'{"amps":30,"poles":3,"voltage":480}','["Eaton BAB3030","Siemens BQ3B030"]','["Panel","MCC"]','breaker,circuit,30a,3pole,480v'],
['CONTACTOR-25A','Contactor 25A 3-Pole 24VDC Coil','CONTACTOR, 25A, 3-POLE, 24VDC COIL','Allen-Bradley','ELECTRICAL','Contactors','EA',45,110,2,'{"amps":25,"poles":3,"coil":"24VDC"}','["Eaton XTCE025C10","Siemens 3RT2026"]','["Motor Starter","MCC"]','contactor,25a,3pole,24vdc'],
['CONTACTOR-40A','Contactor 40A 3-Pole 24VDC Coil','CONTACTOR, 40A, 3-POLE, 24VDC COIL','Allen-Bradley','ELECTRICAL','Contactors','EA',65,160,2,'{"amps":40}','["Eaton XTCE040D"]','["Motor Starter","MCC"]','contactor,40a,3pole'],
['OVERLOAD-9-13A','Overload Relay 9-13A Class 10','OVERLOAD RELAY, 9-13A, CLASS 10','Allen-Bradley','ELECTRICAL','Overloads','EA',30,75,2,'{"range":"9-13A","class":10}','["Eaton XTOB013","Siemens 3RU2116"]','["Motor Starter"]','overload,relay,9-13a'],
['OVERLOAD-18-25A','Overload Relay 18-25A Class 10','OVERLOAD RELAY, 18-25A, CLASS 10','Allen-Bradley','ELECTRICAL','Overloads','EA',35,85,2,'{"range":"18-25A"}','["Eaton XTOB025"]','["Motor Starter"]','overload,relay,18-25a'],
['PILOT-LIGHT-GREEN','Pilot Light 22mm Green LED 24V','PILOT LIGHT, 22mm, GREEN, LED, 24V','Allen-Bradley','ELECTRICAL','Pilot Devices','EA',8,22,1,'{"size":"22mm","color":"green","type":"LED"}','["Eaton M22","Siemens 3SU1"]','["Control Panel"]','pilot,light,green,22mm,led'],
['PILOT-LIGHT-RED','Pilot Light 22mm Red LED 24V','PILOT LIGHT, 22mm, RED, LED, 24V','Allen-Bradley','ELECTRICAL','Pilot Devices','EA',8,22,1,'{"color":"red"}','["Eaton M22","Siemens 3SU1"]','["Control Panel"]','pilot,light,red,22mm'],
['PUSHBUTTON-GREEN','Pushbutton 22mm Green Momentary Flush','PUSHBUTTON, 22mm, GREEN, MOMENTARY, FLUSH','Allen-Bradley','ELECTRICAL','Pilot Devices','EA',10,28,1,'{"size":"22mm","color":"green","type":"momentary"}','["Eaton M22","Siemens 3SU1"]','["Control Panel"]','pushbutton,22mm,green,start'],
['PUSHBUTTON-RED','Pushbutton 22mm Red Momentary Flush','PUSHBUTTON, 22mm, RED, MOMENTARY, FLUSH','Allen-Bradley','ELECTRICAL','Pilot Devices','EA',10,28,1,'{"color":"red"}','["Eaton M22"]','["Control Panel"]','pushbutton,22mm,red,stop'],
['ESTOP-MUSHROOM','E-Stop Mushroom Head 22mm 1NC+1NO','E-STOP, MUSHROOM HEAD, 22mm, 1NC+1NO, TWIST RELEASE','Allen-Bradley','ELECTRICAL','Safety','EA',18,45,1,'{"type":"mushroom","contacts":"1NC+1NO","release":"twist"}','["Eaton M22-PVT","Siemens 3SU1"]','["All Equipment"]','estop,emergency,stop,mushroom,safety'],
['POWER-SUPPLY-24V-5A','Power Supply 24VDC 5A 120W DIN Rail','POWER SUPPLY, 24VDC, 5A, 120W, DIN RAIL','Allen-Bradley','ELECTRICAL','Power Supplies','EA',80,180,3,'{"output":"24VDC","amps":5,"watts":120}','["Phoenix QUINT","Mean Well MDR-120-24","Siemens SITOP"]','["Control Panel","PLC"]','power,supply,24vdc,5a,din,rail'],
['POWER-SUPPLY-24V-10A','Power Supply 24VDC 10A 240W DIN Rail','POWER SUPPLY, 24VDC, 10A, 240W, DIN RAIL','Allen-Bradley','ELECTRICAL','Power Supplies','EA',120,280,3,'{"output":"24VDC","amps":10,"watts":240}','["Phoenix QUINT","Mean Well SDR-240-24"]','["Control Panel","PLC"]','power,supply,24vdc,10a'],
['RELAY-ICE-CUBE-24V','Ice Cube Relay 24VDC DPDT 10A w/Socket','RELAY, ICE CUBE, 24VDC, DPDT, 10A, WITH SOCKET','Allen-Bradley','ELECTRICAL','Relays','EA',15,35,1,'{"coil":"24VDC","contacts":"DPDT","amps":10}','["Omron MY2N","Finder 55.32"]','["Control Panel"]','relay,ice,cube,dpdt,24vdc'],

// ── SAFETY & PPE ─────────────────────────────────────────────────────
['SAFETY-GLASSES-CLEAR','Safety Glasses Clear Anti-Fog','GLASSES, SAFETY, CLEAR, ANTI-FOG','3M','SAFETY','Eye Protection','PR',3,8,1,null,'["Uvex Astrospec","Honeywell A800"]','["All Areas"]','safety,glasses,eye,protection,ppe'],
['EARPLUGS-FOAM-200','Foam Ear Plugs NRR 32dB Box/200','EAR PLUGS, FOAM, NRR 32dB, BOX/200','3M','SAFETY','Hearing','BX',20,45,1,'{"nrr":32}','["Moldex Pura-Fit","Howard Leight"]','["Processing","Packaging"]','earplugs,hearing,protection,ppe'],
['NITRILE-GLOVES-L-100','Nitrile Gloves Large 5mil Box/100','GLOVES, NITRILE, LARGE, 5MIL, BOX/100','Generic','SAFETY','Hand Protection','BX',8,18,1,'{"size":"L","thickness":"5mil","material":"nitrile"}',null,'["All Areas"]','gloves,nitrile,disposable,ppe'],
['HARD-HAT-WHITE','Hard Hat Type I Class E White Ratchet','HARD HAT, TYPE I, CLASS E, WHITE, RATCHET','MSA','SAFETY','Head Protection','EA',15,35,1,'{"type":"I","class":"E"}','["3M H-700","Honeywell North"]','["All Areas"]','hardhat,head,protection,ppe'],
['LOCKOUT-KIT-ELEC','Lockout/Tagout Kit Electrical (Personal)','LOCKOUT KIT, ELECTRICAL, PERSONAL, COMPLETE','Brady','SAFETY','LOTO','KIT',45,100,3,'{"includes":"padlock,hasps,tags,breaker_locks"}','["Master Lock 1457E"]','["All Equipment"]','lockout,tagout,loto,kit,safety'],
['PADLOCK-SAFETY-RED','Safety Padlock 1.5in Shackle Red Keyed Diff','PADLOCK, SAFETY, RED, 1.5in SHACKLE, KEYED DIFFERENT','Brady','SAFETY','LOTO','EA',8,20,1,'{"color":"red","shackle_in":1.5}','["Master Lock 410","American Lock 1105"]','["LOTO"]','padlock,safety,lockout,red'],

// ── HARDWARE ─────────────────────────────────────────────────────────
['SS-HEX-3/8-16x1','Hex Bolt 3/8-16 x 1in 316 SS (Box/25)','BOLT, HEX, 3/8-16 x 1in, 316 SS, BOX/25','Generic','HARDWARE','Fasteners','BX',12,28,1,'{"thread":"3/8-16","length_in":1,"material":"316 SS","qty":25}',null,'["All Dairy"]','bolt,hex,stainless,3/8,316'],
['SS-HEX-1/2-13x1.5','Hex Bolt 1/2-13 x 1.5in 316 SS (Box/25)','BOLT, HEX, 1/2-13 x 1.5in, 316 SS, BOX/25','Generic','HARDWARE','Fasteners','BX',18,40,1,'{"thread":"1/2-13","length_in":1.5}',null,'["All Dairy"]','bolt,hex,stainless,1/2,316'],
['SS-NUT-3/8-16','Hex Nut 3/8-16 316 SS (Box/50)','NUT, HEX, 3/8-16, 316 SS, BOX/50','Generic','HARDWARE','Fasteners','BX',8,18,1,null,null,'["All Dairy"]','nut,hex,stainless,3/8'],
['SS-WASHER-3/8','Flat Washer 3/8 316 SS (Box/50)','WASHER, FLAT, 3/8, 316 SS, BOX/50','Generic','HARDWARE','Fasteners','BX',6,14,1,null,null,'["All Dairy"]','washer,flat,stainless,3/8'],
['CABLE-TIE-8IN-100','Cable Tie 8in Natural Nylon (Bag/100)','CABLE TIE, 8in, NATURAL, NYLON, BAG/100','Generic','HARDWARE','Cable Management','BG',3,8,1,null,null,'["All Electrical"]','cable,tie,zip,tie,8inch'],
['WIRE-12AWG-500','Wire THHN 12AWG Stranded 500ft','WIRE, THHN, 12AWG, STRANDED, 500FT','Southwire','ELECTRICAL','Wire','ROLL',65,120,2,'{"gauge":"12AWG","type":"THHN","strand":"stranded","length_ft":500}',null,'["All Electrical"]','wire,thhn,12awg,stranded'],
['CONDUIT-EMT-3/4-10','EMT Conduit 3/4in x 10ft','CONDUIT, EMT, 3/4in, 10FT','Allied','ELECTRICAL','Conduit','EA',6,14,1,'{"size_in":0.75,"length_ft":10}',null,'["All Electrical"]','conduit,emt,3/4,electrical'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 3: ${parts.length} parts seeded (Fittings, Chemicals, Lubricants, Safety, Electrical, Hardware)`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
console.log(`   📦 Total parts in catalog: ${total}`);
db.close();
