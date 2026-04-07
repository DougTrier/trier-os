// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 2: Motors, Valves, Pumps, Electrical, Sensors
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── MOTORS ───────────────────────────────────────────────────────────
['BALDOR-EM3554T','AC Motor 1.5HP 1760RPM 145TC TEFC 208-230/460V','MOTOR, AC, 1.5HP, 1760RPM, 145TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',280,450,3,'{"hp":1.5,"rpm":1760,"frame":"145TC","encl":"TEFC","voltage":"208-230/460"}','["WEG 01518ET3E145TC","Marathon 145TTFNA6526"]','["Pump","Conveyor","Mixer"]','motor,ac,1.5hp,145tc,tefc'],
['BALDOR-EM3558T','AC Motor 2HP 1755RPM 145TC TEFC','MOTOR, AC, 2HP, 1755RPM, 145TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',320,520,3,'{"hp":2,"rpm":1755,"frame":"145TC"}','["WEG 02018ET3E145TC"]','["Pump","Conveyor","Blower"]','motor,ac,2hp,145tc'],
['BALDOR-EM3611T','AC Motor 3HP 1760RPM 182TC TEFC','MOTOR, AC, 3HP, 1760RPM, 182TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',380,620,3,'{"hp":3,"rpm":1760,"frame":"182TC"}','["WEG 03018ET3E182TC"]','["Pump","Blower","Compressor"]','motor,ac,3hp,182tc'],
['BALDOR-EM3615T','AC Motor 5HP 1750RPM 184TC TEFC','MOTOR, AC, 5HP, 1750RPM, 184TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',450,750,3,'{"hp":5,"rpm":1750,"frame":"184TC"}','["WEG 05018ET3E184TC","Marathon 184TTFNA6570"]','["Pump","Blower","Conveyor"]','motor,ac,5hp,184tc'],
['BALDOR-EM3709','AC Motor 7.5HP 3520RPM 213TC TEFC','MOTOR, AC, 7.5HP, 3520RPM, 213TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',580,950,5,'{"hp":7.5,"rpm":3520,"frame":"213TC"}','["WEG 07536ET3E213TC"]','["Homogenizer","Compressor"]','motor,ac,7.5hp,213tc'],
['BALDOR-EM3770T','AC Motor 7.5HP 1770RPM 213TC TEFC','MOTOR, AC, 7.5HP, 1770RPM, 213TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',600,980,5,'{"hp":7.5,"rpm":1770,"frame":"213TC"}','["WEG 07518ET3E213TC"]','["Pump","Blower"]','motor,ac,7.5hp,1770rpm'],
['BALDOR-EM3774T','AC Motor 10HP 1760RPM 215TC TEFC','MOTOR, AC, 10HP, 1760RPM, 215TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',720,1200,5,'{"hp":10,"rpm":1760,"frame":"215TC"}','["WEG 01018ET3E215TC"]','["Pump","Blower","Compressor"]','motor,ac,10hp,215tc'],
['BALDOR-EM3783T','AC Motor 15HP 1760RPM 254TC TEFC','MOTOR, AC, 15HP, 1760RPM, 254TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',950,1600,7,'{"hp":15,"frame":"254TC"}','["WEG 01518ET3E254TC"]','["Large Pump","Compressor"]','motor,ac,15hp,254tc'],
['BALDOR-EM3787T','AC Motor 20HP 1765RPM 256TC TEFC','MOTOR, AC, 20HP, 1765RPM, 256TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',1200,2000,7,'{"hp":20,"frame":"256TC"}','["WEG 02018ET3E256TC"]','["Large Pump","Compressor"]','motor,ac,20hp,256tc'],
['BALDOR-EM4103T','AC Motor 25HP 1770RPM 284TC TEFC','MOTOR, AC, 25HP, 1770RPM, 284TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',1500,2500,10,'{"hp":25,"frame":"284TC"}','["WEG 02518ET3E284TC"]','["Large Pump","Compressor","Chiller"]','motor,ac,25hp,284tc'],
['BALDOR-EM4104T','AC Motor 30HP 1770RPM 286TC TEFC','MOTOR, AC, 30HP, 1770RPM, 286TC, TEFC','Baldor/ABB','MOTORS','AC Motors','EA',1800,3000,10,'{"hp":30,"frame":"286TC"}',null,'["Compressor","Large Fan"]','motor,ac,30hp,286tc'],
['BALDOR-SS-2HP','Washdown Motor 2HP 1750RPM 56C TENV SS','MOTOR, WASHDOWN, 2HP, 56C, STAINLESS','Baldor/ABB','MOTORS','Washdown Motors','EA',800,1400,7,'{"hp":2,"frame":"56C","encl":"TENV","material":"SS"}','["Leeson 116345","Marathon 056C17F5329"]','["Filler","CIP","Dairy Processing"]','motor,washdown,stainless,2hp,sanitary'],
['BALDOR-SS-3HP','Washdown Motor 3HP 1750RPM 182TC TENV SS','MOTOR, WASHDOWN, 3HP, 182TC, STAINLESS','Baldor/ABB','MOTORS','Washdown Motors','EA',1100,1800,7,'{"hp":3,"frame":"182TC","material":"SS"}',null,'["Filler","CIP","Dairy"]','motor,washdown,stainless,3hp'],

// ── GEARBOXES / REDUCERS ─────────────────────────────────────────────
['SEW-R47DRE80M4','Helical Gear Reducer 1HP 28.56:1','GEARMOTOR, HELICAL, 1HP, 28.56:1, SEW R47','SEW-Eurodrive','MOTORS','Gearmotors','EA',600,1100,10,'{"ratio":"28.56:1","hp":1,"output_rpm":60}',null,'["Conveyor","Filler"]','gearmotor,sew,helical,1hp'],
['SEW-R57DRE90M4','Helical Gear Reducer 2HP 23.93:1','GEARMOTOR, HELICAL, 2HP, 23.93:1, SEW R57','SEW-Eurodrive','MOTORS','Gearmotors','EA',800,1400,10,'{"ratio":"23.93:1","hp":2}',null,'["Conveyor","Mixer"]','gearmotor,sew,helical,2hp'],
['NORD-SK1SI50','Inline Gearmotor 1HP 30:1 NORD','GEARMOTOR, INLINE, 1HP, 30:1, NORD SK1SI50','Nord','MOTORS','Gearmotors','EA',550,1000,10,'{"ratio":"30:1","hp":1}',null,'["Conveyor"]','gearmotor,nord,inline,1hp'],
['DODGE-TIGEAR2-20S20L','Right Angle Worm Reducer 20:1 Shaft Mount','REDUCER, WORM, 20:1, DODGE TIGEAR-2','Dodge','MOTORS','Reducers','EA',350,700,5,'{"ratio":"20:1","type":"worm"}',null,'["Conveyor","Mixer","Agitator"]','reducer,worm,dodge,tigear,20to1'],

// ── SANITARY VALVES ──────────────────────────────────────────────────
['ALFA-BV-15-SS','Butterfly Valve 1.5in Tri-Clamp SS Manual','VALVE, BUTTERFLY, 1.5in, TRI-CLAMP, SS, MANUAL','Alfa Laval','FLUID','Sanitary Valves','EA',45,120,3,'{"size_in":1.5,"material":"316L SS","connection":"tri-clamp","actuation":"manual"}',null,'["All Dairy Process"]','valve,butterfly,sanitary,1.5,triclamp'],
['ALFA-BV-20-SS','Butterfly Valve 2.0in Tri-Clamp SS Manual','VALVE, BUTTERFLY, 2.0in, TRI-CLAMP, SS, MANUAL','Alfa Laval','FLUID','Sanitary Valves','EA',55,140,3,'{"size_in":2}',null,'["All Dairy Process"]','valve,butterfly,sanitary,2inch'],
['ALFA-BV-25-SS','Butterfly Valve 2.5in Tri-Clamp SS Manual','VALVE, BUTTERFLY, 2.5in, TRI-CLAMP, SS, MANUAL','Alfa Laval','FLUID','Sanitary Valves','EA',65,160,3,'{"size_in":2.5}',null,'["All Dairy Process"]','valve,butterfly,sanitary,2.5inch'],
['ALFA-BV-30-SS','Butterfly Valve 3.0in Tri-Clamp SS Manual','VALVE, BUTTERFLY, 3.0in, TRI-CLAMP, SS, MANUAL','Alfa Laval','FLUID','Sanitary Valves','EA',80,200,3,'{"size_in":3}',null,'["All Dairy Process"]','valve,butterfly,sanitary,3inch'],
['ALFA-BV-40-SS','Butterfly Valve 4.0in Tri-Clamp SS Manual','VALVE, BUTTERFLY, 4.0in, TRI-CLAMP, SS, MANUAL','Alfa Laval','FLUID','Sanitary Valves','EA',110,280,5,'{"size_in":4}',null,'["All Dairy Process"]','valve,butterfly,sanitary,4inch'],
['ALFA-MIX-25','Mix-Proof Valve 2.5in Alfa Laval Unique','VALVE, MIX-PROOF, 2.5in, ALFA LAVAL UNIQUE','Alfa Laval','FLUID','Sanitary Valves','EA',800,2200,10,'{"size_in":2.5,"type":"mix_proof"}',null,'["HTST_PASTEURIZER","CIP_SYSTEM"]','valve,mixproof,sanitary,alfa,laval'],
['ALFA-MIX-30','Mix-Proof Valve 3.0in Alfa Laval Unique','VALVE, MIX-PROOF, 3.0in, ALFA LAVAL UNIQUE','Alfa Laval','FLUID','Sanitary Valves','EA',1000,2800,10,'{"size_in":3}',null,'["HTST_PASTEURIZER","CIP_SYSTEM"]','valve,mixproof,3inch'],
['TOP-LINE-CHECK-15','Check Valve 1.5in Tri-Clamp SS','VALVE, CHECK, 1.5in, TRI-CLAMP, SS','Top Line','FLUID','Sanitary Valves','EA',35,90,3,null,null,'["Pump Discharge","CIP"]','valve,check,sanitary,1.5'],
['TOP-LINE-CHECK-20','Check Valve 2.0in Tri-Clamp SS','VALVE, CHECK, 2.0in, TRI-CLAMP, SS','Top Line','FLUID','Sanitary Valves','EA',45,110,3,null,null,'["Pump Discharge","CIP"]','valve,check,sanitary,2inch'],
['SMC-VFS3110-5DZ','Solenoid Valve 5-Port 1/4 NPT 24VDC','VALVE, SOLENOID, 5-PORT, 1/4 NPT, 24VDC','SMC','PNEUMATIC','Solenoid Valves','EA',40,100,2,'{"ports":5,"size":"1/4 NPT","voltage":"24VDC"}','["Festo VUVG","Parker B512"]','["Pneumatic Actuator","Filler","Packaging"]','valve,solenoid,pneumatic,smc,24vdc'],
['SMC-VFS4110-5DZ','Solenoid Valve 5-Port 3/8 NPT 24VDC','VALVE, SOLENOID, 5-PORT, 3/8 NPT, 24VDC','SMC','PNEUMATIC','Solenoid Valves','EA',55,130,2,'{"size":"3/8 NPT"}','["Festo VUVG"]','["Pneumatic Actuator"]','valve,solenoid,pneumatic,3/8'],
['PARKER-BALL-15-SS','Ball Valve 1.5in 150# Flanged SS','VALVE, BALL, 1.5in, 150#, FLANGED, SS','Parker','FLUID','Industrial Valves','EA',80,200,5,'{"size_in":1.5,"class":"150","material":"316 SS"}',null,'["Utility","Steam","Water"]','valve,ball,1.5,flanged,stainless'],
['PARKER-BALL-20-SS','Ball Valve 2.0in 150# Flanged SS','VALVE, BALL, 2.0in, 150#, FLANGED, SS','Parker','FLUID','Industrial Valves','EA',110,280,5,'{"size_in":2}',null,'["Utility","Steam","Water"]','valve,ball,2inch,flanged'],

// ── PUMPS & PUMP PARTS ───────────────────────────────────────────────
['WAUK-030-IMPELLER','Waukesha C-Series Impeller 030 SS','IMPELLER, WAUKESHA C-SERIES 030, SS','Waukesha','FLUID','Pump Parts','EA',250,600,10,'{"series":"C","model":"030","material":"316L SS"}',null,'["Centrifugal Pump"]','impeller,waukesha,030,sanitary'],
['WAUK-130-ROTOR','Waukesha 130 PD Pump Rotor Set','ROTOR SET, WAUKESHA 130, SS','Waukesha','FLUID','Pump Parts','EA',400,900,10,'{"model":"130","type":"bi-wing"}',null,'["PD Pump"]','rotor,waukesha,130,pd,pump'],
['FRISTAM-FP3532-IMPELLER','Fristam FP3532 Impeller SS','IMPELLER, FRISTAM FP3532, SS','Fristam','FLUID','Pump Parts','EA',200,500,10,null,null,'["Centrifugal Pump"]','impeller,fristam,fp3532'],
['WAUK-GASKET-KIT-030','Waukesha 030 Gasket/Seal Kit','GASKET KIT, WAUKESHA C-SERIES 030','Waukesha','SEALS','Pump Rebuild Kits','EA',60,150,5,null,null,'["Centrifugal Pump"]','gasket,kit,waukesha,030,rebuild'],
['WAUK-GASKET-KIT-130','Waukesha 130 PD Pump Rebuild Kit','REBUILD KIT, WAUKESHA 130 PD PUMP','Waukesha','SEALS','Pump Rebuild Kits','EA',120,300,7,null,null,'["PD Pump"]','rebuild,kit,waukesha,130,pd'],

// ── VFDs / DRIVES ────────────────────────────────────────────────────
['AB-PF525-1HP','Allen-Bradley PowerFlex 525 1HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 1HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',350,550,3,'{"hp":1,"voltage":"480V","series":"PowerFlex 525"}','["ABB ACS355","Siemens V20"]','["Pump","Conveyor","Mixer"]','vfd,drive,allen,bradley,pf525,1hp'],
['AB-PF525-2HP','Allen-Bradley PowerFlex 525 2HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 2HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',450,700,3,'{"hp":2}','["ABB ACS355","Siemens V20"]','["Pump","Conveyor"]','vfd,drive,pf525,2hp'],
['AB-PF525-5HP','Allen-Bradley PowerFlex 525 5HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 5HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',650,1050,3,'{"hp":5}','["ABB ACS355"]','["Pump","Blower"]','vfd,drive,pf525,5hp'],
['AB-PF525-10HP','Allen-Bradley PowerFlex 525 10HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 10HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',900,1500,5,'{"hp":10}',null,'["Pump","Blower","Compressor"]','vfd,drive,pf525,10hp'],
['AB-PF525-15HP','Allen-Bradley PowerFlex 525 15HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 15HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',1200,2000,5,'{"hp":15}',null,'["Large Pump","Compressor"]','vfd,drive,pf525,15hp'],
['AB-PF525-25HP','Allen-Bradley PowerFlex 525 25HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 25HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',1800,3000,7,'{"hp":25}',null,'["Compressor","Large Motor"]','vfd,drive,pf525,25hp'],

// ── SENSORS & INSTRUMENTATION ────────────────────────────────────────
['EH-TR10-PT100','Temperature Sensor RTD PT100 Tri-Clamp SS','SENSOR, TEMP, RTD PT100, TRI-CLAMP, SS','Endress+Hauser','ELECTRICAL','Temperature','EA',120,350,5,'{"type":"RTD","element":"PT100","connection":"tri-clamp","material":"316L SS"}','["Anderson SV074"]','["HTST_PASTEURIZER","CIP_SYSTEM","Tank"]','sensor,temperature,rtd,pt100,sanitary'],
['EH-TR10-TC-J','Thermocouple Type J Tri-Clamp SS','SENSOR, TEMP, THERMOCOUPLE TYPE J, TRI-CLAMP','Endress+Hauser','ELECTRICAL','Temperature','EA',80,200,5,'{"type":"thermocouple","junction":"J"}',null,'["HTST_PASTEURIZER","Boiler"]','sensor,temperature,thermocouple,type-j'],
['EH-PMC21-040','Pressure Transmitter 0-40 PSI 4-20mA Sanitary','TRANSMITTER, PRESSURE, 0-40 PSI, 4-20mA, SANITARY','Endress+Hauser','ELECTRICAL','Pressure','EA',250,650,7,'{"range_psi":"0-40","output":"4-20mA","connection":"tri-clamp"}','["Rosemount 2088","Anderson SV073"]','["HTST_PASTEURIZER","Homogenizer","CIP"]','sensor,pressure,transmitter,sanitary,4-20ma'],
['EH-PMC21-100','Pressure Transmitter 0-100 PSI 4-20mA','TRANSMITTER, PRESSURE, 0-100 PSI, 4-20mA','Endress+Hauser','ELECTRICAL','Pressure','EA',250,650,7,'{"range_psi":"0-100"}','["Rosemount 2088"]','["Compressed Air","Steam"]','sensor,pressure,transmitter,0-100'],
['EH-PROMAG-10P','Magnetic Flow Meter 2in Sanitary Tri-Clamp','FLOW METER, MAG, 2in, SANITARY, ENDRESS PROMAG 10P','Endress+Hauser','ELECTRICAL','Flow','EA',1200,3500,14,'{"size_in":2,"type":"electromagnetic","connection":"tri-clamp"}','["Yokogawa AXF","Rosemount 8700"]','["HTST_PASTEURIZER","CIP_SYSTEM","Filler"]','flow,meter,mag,magnetic,sanitary,2inch'],
['EH-LIQUILINE-PH','pH Transmitter Liquiline CM442 w/ Probe','TRANSMITTER, pH, ENDRESS LIQUILINE CM442','Endress+Hauser','ELECTRICAL','Analytical','EA',800,2200,10,'{"type":"pH","output":"4-20mA + HART"}','["Hach SC200","Mettler Toledo M400"]','["CIP_SYSTEM","WASTEWATER"]','sensor,ph,transmitter,analytical'],
['EH-FTL50-LEVEL','Point Level Switch Vibronic Tri-Clamp','SWITCH, LEVEL, VIBRONIC, TRI-CLAMP, ENDRESS FTL50','Endress+Hauser','ELECTRICAL','Level','EA',200,550,7,'{"type":"vibronic","connection":"tri-clamp"}',null,'["Tank","Silo"]','sensor,level,switch,vibronic,sanitary'],
['EH-FMR20-RADAR','Radar Level Transmitter 4-20mA','TRANSMITTER, LEVEL, RADAR, FMR20, 4-20mA','Endress+Hauser','ELECTRICAL','Level','EA',600,1800,10,'{"type":"radar","output":"4-20mA"}','["Siemens LR250","Vega VEGAPULS"]','["Silo","Tank"]','sensor,level,radar,transmitter'],
['PROX-M12-NPN','Proximity Sensor M12 Inductive NPN 4mm 24VDC','SENSOR, PROXIMITY, M12, INDUCTIVE, NPN, 24VDC','Sick','ELECTRICAL','Proximity','EA',25,65,2,'{"type":"inductive","size":"M12","range_mm":4,"output":"NPN","voltage":"24VDC"}','["Allen-Bradley 872C","IFM IFS204","Omron E2E"]','["Conveyor","Filler","Packaging"]','sensor,proximity,inductive,m12,npn'],
['PROX-M18-PNP','Proximity Sensor M18 Inductive PNP 8mm 24VDC','SENSOR, PROXIMITY, M18, INDUCTIVE, PNP, 24VDC','Sick','ELECTRICAL','Proximity','EA',30,75,2,'{"size":"M18","range_mm":8,"output":"PNP"}','["Allen-Bradley 872C","IFM IFS"]','["Conveyor","Packaging"]','sensor,proximity,m18,pnp'],
['PE-SENSOR-M18','Photoelectric Sensor M18 Diffuse 300mm 24VDC','SENSOR, PHOTOELECTRIC, M18, DIFFUSE, 300mm','Sick','ELECTRICAL','Photoelectric','EA',45,120,2,'{"type":"diffuse","range_mm":300}','["Allen-Bradley 42EF","Banner QS18","Omron E3Z"]','["Conveyor","Case Detect","Filler"]','sensor,photoelectric,diffuse,m18'],
['PE-SENSOR-RETRO','Photoelectric Sensor Retroreflective 5m 24VDC','SENSOR, PHOTOELECTRIC, RETROREFLECTIVE, 5m','Sick','ELECTRICAL','Photoelectric','EA',55,140,2,'{"type":"retroreflective","range_m":5}','["Allen-Bradley 42EF","Banner Q45"]','["Conveyor","Palletizer"]','sensor,photoelectric,retroreflective'],

// ── PLC & CONTROLS ───────────────────────────────────────────────────
['AB-1769-L33ER','CompactLogix 5370 L33ER Controller 2MB','PLC, COMPACTLOGIX 5370, L33ER, 2MB, ALLEN-BRADLEY','Allen-Bradley','ELECTRICAL','PLCs','EA',2500,4000,7,'{"memory":"2MB","ethernet":"yes","series":"5370"}',null,'["All Process Control"]','plc,compactlogix,allen,bradley,l33er'],
['AB-1769-IF4','CompactLogix 4-Ch Analog Input Module','MODULE, ANALOG INPUT, 4-CH, 1769-IF4','Allen-Bradley','ELECTRICAL','PLC I/O','EA',250,450,3,'{"channels":4,"type":"analog_input","range":"4-20mA/0-10V"}',null,'["All Process Control"]','plc,module,analog,input,1769'],
['AB-1769-OF4','CompactLogix 4-Ch Analog Output Module','MODULE, ANALOG OUTPUT, 4-CH, 1769-OF4','Allen-Bradley','ELECTRICAL','PLC I/O','EA',300,500,3,'{"channels":4,"type":"analog_output"}',null,'["All Process Control"]','plc,module,analog,output'],
['AB-1769-IQ16','CompactLogix 16-Pt Digital Input Module','MODULE, DIGITAL INPUT, 16-PT, 1769-IQ16','Allen-Bradley','ELECTRICAL','PLC I/O','EA',150,280,3,'{"points":16,"type":"digital_input","voltage":"24VDC"}',null,'["All Process Control"]','plc,module,digital,input,16pt'],
['AB-1769-OW8','CompactLogix 8-Pt Relay Output Module','MODULE, RELAY OUTPUT, 8-PT, 1769-OW8','Allen-Bradley','ELECTRICAL','PLC I/O','EA',180,320,3,'{"points":8,"type":"relay_output"}',null,'["All Process Control"]','plc,module,relay,output,8pt'],
['AB-2711R-T7T','PanelView 800 7in HMI Color Touch','HMI, PANELVIEW 800, 7in, COLOR TOUCH','Allen-Bradley','ELECTRICAL','HMIs','EA',800,1400,5,'{"size_in":7,"color":true,"touch":true}',null,'["All Process Control"]','hmi,panelview,800,7inch,touch'],
['AB-2711R-T10T','PanelView 800 10in HMI Color Touch','HMI, PANELVIEW 800, 10in, COLOR TOUCH','Allen-Bradley','ELECTRICAL','HMIs','EA',1200,2000,5,'{"size_in":10}',null,'["All Process Control"]','hmi,panelview,10inch'],

// ── PNEUMATIC COMPONENTS ─────────────────────────────────────────────
['SMC-CG5BN40-100','Air Cylinder 40mm Bore 100mm Stroke SS','CYLINDER, AIR, 40mm BORE, 100mm STROKE, SS','SMC','PNEUMATIC','Cylinders','EA',60,150,3,'{"bore_mm":40,"stroke_mm":100,"material":"SS"}','["Festo DSBC-40-100"]','["Filler","Packaging","Actuator"]','cylinder,air,pneumatic,40mm,smc'],
['SMC-CG5BN63-150','Air Cylinder 63mm Bore 150mm Stroke SS','CYLINDER, AIR, 63mm BORE, 150mm STROKE, SS','SMC','PNEUMATIC','Cylinders','EA',90,220,3,'{"bore_mm":63,"stroke_mm":150}','["Festo DSBC-63-150"]','["Case Erector","Packaging"]','cylinder,air,pneumatic,63mm'],
['SMC-AF40-04','Air Filter Regulator 1/2 NPT','FILTER/REGULATOR, AIR, 1/2 NPT, SMC AF40','SMC','PNEUMATIC','Air Prep','EA',40,100,2,'{"port":"1/2 NPT","filter":"5 micron"}','["Norgren B73G","Parker 07E"]','["All Pneumatic"]','filter,regulator,air,prep,frl'],
['SMC-AL40-04','Air Lubricator 1/2 NPT','LUBRICATOR, AIR, 1/2 NPT, SMC AL40','SMC','PNEUMATIC','Air Prep','EA',35,85,2,'{"port":"1/2 NPT"}',null,'["All Pneumatic"]','lubricator,air,prep,frl'],
['POLYURETHANE-3/8','Polyurethane Air Tubing 3/8 OD Blue 100ft','TUBING, AIR, POLYURETHANE, 3/8 OD, 100FT','SMC','PNEUMATIC','Tubing','ROLL',25,60,1,'{"od_in":0.375,"material":"polyurethane","length_ft":100}',null,'["All Pneumatic"]','tubing,air,polyurethane,3/8'],
['PUSH-CONNECT-3/8','Push-to-Connect Fitting 3/8 OD x 1/4 NPT','FITTING, PUSH-TO-CONNECT, 3/8 OD x 1/4 NPT','SMC','PNEUMATIC','Fittings','EA',3,8,1,null,'["Parker Prestolok","Legris 3101"]','["All Pneumatic"]','fitting,push,connect,pneumatic'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 2: ${parts.length} parts seeded (Motors, Valves, Pumps, Electrical, Sensors, Pneumatics)`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
console.log(`   📦 Total parts in catalog: ${total}`);
db.close();
