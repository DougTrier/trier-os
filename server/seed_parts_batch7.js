// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 7: Push to 500+ (VFDs, more sensors, cheese/yogurt, cleaning, misc)
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// ── MORE VFDs (complete HP range) ────────────────────────────────────
['AB-PF525-3HP','Allen-Bradley PowerFlex 525 3HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 3HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',550,850,3,'{"hp":3,"voltage":"480V","series":"PowerFlex 525"}','["ABB ACS355","Siemens V20"]','["Pump","Conveyor"]','vfd,drive,pf525,3hp'],
['AB-PF525-7.5HP','Allen-Bradley PowerFlex 525 7.5HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 7.5HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',750,1250,5,'{"hp":7.5}',null,'["Pump","Blower"]','vfd,drive,pf525,7.5hp'],
['AB-PF525-20HP','Allen-Bradley PowerFlex 525 20HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 20HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',1500,2500,7,'{"hp":20}',null,'["Compressor","Large Pump"]','vfd,drive,pf525,20hp'],
['AB-PF525-30HP','Allen-Bradley PowerFlex 525 30HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 30HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',2200,3500,7,'{"hp":30}',null,'["Compressor","Large Motor"]','vfd,drive,pf525,30hp'],
['AB-PF525-40HP','Allen-Bradley PowerFlex 525 40HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 40HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',2800,4500,10,'{"hp":40}',null,'["Large Compressor"]','vfd,drive,pf525,40hp'],
['AB-PF525-50HP','Allen-Bradley PowerFlex 525 50HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 50HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',3500,5500,10,'{"hp":50}',null,'["Ammonia Compressor"]','vfd,drive,pf525,50hp'],
['AB-PF525-75HP','Allen-Bradley PowerFlex 525 75HP 480V VFD','VFD, ALLEN-BRADLEY PF525, 75HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',5000,8000,14,'{"hp":75}',null,'["Large Compressor"]','vfd,drive,pf525,75hp'],
['AB-PF753-100HP','Allen-Bradley PowerFlex 753 100HP 480V VFD','VFD, ALLEN-BRADLEY PF753, 100HP, 480V','Allen-Bradley','ELECTRICAL','VFDs','EA',7000,12000,14,'{"hp":100,"series":"PowerFlex 753"}',null,'["Large Compressor","Chiller"]','vfd,drive,pf753,100hp'],

// ── MORE SENSORS ─────────────────────────────────────────────────────
['EH-TR10-PT100-4W','RTD PT100 4-Wire Sanitary 4in Insert','SENSOR, TEMP, RTD PT100, 4-WIRE, 4in, SANITARY','Endress+Hauser','ELECTRICAL','Temperature','EA',150,400,5,'{"type":"RTD","wires":4,"insert_in":4}',null,'["HTST","Tank","Process"]','sensor,temperature,rtd,4wire,sanitary'],
['ANDERSON-SV074','Temperature Sensor Anderson SV074 Sanitary','SENSOR, TEMP, ANDERSON SV074, SANITARY','Anderson Instrument','ELECTRICAL','Temperature','EA',100,280,5,'{"type":"RTD/thermowell","3A":true}','["E+H TR10"]','["HTST_PASTEURIZER"]','sensor,temperature,anderson,sanitary'],
['EH-PMC21-200','Pressure Transmitter 0-200 PSI Sanitary','TRANSMITTER, PRESSURE, 0-200 PSI, 4-20mA, SANITARY','Endress+Hauser','ELECTRICAL','Pressure','EA',280,700,7,'{"range_psi":"0-200"}',null,'["Homogenizer","Steam"]','sensor,pressure,0-200,sanitary'],
['EH-PMC21-500','Pressure Transmitter 0-500 PSI Industrial','TRANSMITTER, PRESSURE, 0-500 PSI, 4-20mA','Endress+Hauser','ELECTRICAL','Pressure','EA',250,650,7,'{"range_psi":"0-500"}','["Rosemount 2088"]','["Compressor","Hydraulic"]','sensor,pressure,0-500'],
['EH-PROMAG-15H','Magnetic Flow Meter 1.5in Sanitary','FLOW METER, MAG, 1.5in, SANITARY, PROMAG 15H','Endress+Hauser','ELECTRICAL','Flow','EA',1000,3000,14,'{"size_in":1.5}',null,'["HTST","CIP","Filler"]','flow,meter,mag,1.5inch,sanitary'],
['EH-PROMAG-30H','Magnetic Flow Meter 3in Sanitary','FLOW METER, MAG, 3in, SANITARY, PROMAG 30H','Endress+Hauser','ELECTRICAL','Flow','EA',1500,4500,14,'{"size_in":3}',null,'["HTST","Large Process"]','flow,meter,mag,3inch'],
['TURB-SENSOR','Turbidity Sensor In-Line Sanitary','SENSOR, TURBIDITY, IN-LINE, SANITARY, 4-20mA','Optek/Endress+Hauser','ELECTRICAL','Analytical','EA',1200,3500,14,'{"output":"4-20mA","connection":"tri-clamp"}',null,'["Separator","CIP Rinse"]','sensor,turbidity,inline,sanitary'],
['COND-SENSOR-CIP','Conductivity Sensor CIP In-Line','SENSOR, CONDUCTIVITY, CIP, IN-LINE, SANITARY','Endress+Hauser','ELECTRICAL','Analytical','EA',400,1100,7,null,'["Hach GLI"]','["CIP_SYSTEM"]','sensor,conductivity,cip,inline'],

// ── CHEESE & YOGURT SPECIFIC ─────────────────────────────────────────
['CHEESE-KNIFE-SET','Cheese Vat Cutting Knife Set SS','KNIFE SET, CHEESE VAT, SS','Stoelting','FLUID','Cheese Parts','SET',300,800,10,'{"material":"316L SS"}',null,'["CHEESE_VAT"]','knife,set,cheese,vat,cutting'],
['CHEESE-DRAIN-BELT','Cheese Drain Belt Perforated 24in x 30ft','BELT, DRAIN, CHEESE, PERFORATED, 24in x 30FT','Intralox','HARDWARE','Cheese Parts','EA',400,900,10,'{"width_in":24,"type":"perforated"}',null,'["Cheese Drain Table"]','belt,drain,cheese,perforated'],
['CHEESE-MOLD-40LB','Cheese Mold 40lb Block SS','MOLD, CHEESE, 40LB BLOCK, SS','Custom','HARDWARE','Cheese Parts','EA',80,200,14,null,null,'["Cheese Press"]','mold,cheese,40lb,block'],
['CHEESE-PRESS-CYL','Cheese Press Hydraulic Cylinder','CYLINDER, HYDRAULIC, CHEESE PRESS','Custom','FLUID','Cheese Parts','EA',300,700,10,null,null,'["Cheese Press"]','cylinder,hydraulic,cheese,press'],
['YOGURT-CULTURE-DOSE','Yogurt Culture Dosing Pump Peristaltic','PUMP, DOSING, PERISTALTIC, CULTURE, SS','Watson-Marlow','FLUID','Yogurt Parts','EA',1500,3500,14,'{"type":"peristaltic"}',null,'["Yogurt Line"]','pump,dosing,peristaltic,culture,yogurt'],
['YOGURT-INCUBATOR-PROBE','Yogurt Incubator Temperature Probe','PROBE, TEMPERATURE, INCUBATOR, YOGURT, SS','Anderson','ELECTRICAL','Yogurt Parts','EA',80,200,5,null,null,'["Yogurt Line","Tank"]','probe,temperature,incubator,yogurt'],
['YOGURT-FRUIT-PUMP','Fruit Feeder Pump PD 2HP SS','PUMP, PD, FRUIT FEEDER, 2HP, SS','Waukesha','FLUID','Yogurt Parts','EA',3000,6000,14,'{"hp":2,"type":"pd","application":"fruit_feeding"}',null,'["Yogurt Line","Cup Filler"]','pump,pd,fruit,feeder,yogurt'],

// ── ICE CREAM SPECIFIC ───────────────────────────────────────────────
['IC-FREEZER-DASHER','Ice Cream Freezer Dasher Assembly','DASHER, ICE CREAM FREEZER, ASSEMBLY','Tetra Pak','FLUID','Ice Cream Parts','EA',800,2500,14,'{"type":"continuous_freezer"}',null,'["Ice Cream Freezer"]','dasher,ice,cream,freezer'],
['IC-FREEZER-BLADE','Ice Cream Freezer Scraper Blade Set','BLADE SET, SCRAPER, ICE CREAM FREEZER','Tetra Pak','HARDWARE','Ice Cream Parts','SET',150,400,7,null,'["APV Crepaco"]','["Ice Cream Freezer"]','blade,scraper,ice,cream,freezer'],
['IC-HARDENING-FAN','Hardening Tunnel Fan Motor 5HP','MOTOR, FAN, HARDENING TUNNEL, 5HP, TEFC','Baldor/ABB','MOTORS','Ice Cream Parts','EA',500,900,7,'{"hp":5,"application":"blast_freezer"}',null,'["Hardening Tunnel"]','motor,fan,hardening,tunnel,ice,cream'],
['IC-VARIEGATOR-PUMP','Variegator/Ripple Pump PD SS','PUMP, VARIEGATOR, PD, SS','Waukesha','FLUID','Ice Cream Parts','EA',2500,5000,14,null,null,'["Ice Cream Line"]','pump,variegator,ripple,ice,cream'],

// ── BUTTER SPECIFIC ──────────────────────────────────────────────────
['BUTTER-BEATER-PIN','Butter Churn Beater Pin Set','PIN SET, BEATER, BUTTER CHURN','GEA','HARDWARE','Butter Parts','SET',200,500,10,null,null,'["BUTTER_CHURN"]','pin,beater,butter,churn'],
['BUTTER-WORKER-BELT','Butter Worker Belt Set','BELT SET, WORKER, BUTTER','GEA','HARDWARE','Butter Parts','SET',300,700,10,null,null,'["BUTTER_CHURN"]','belt,worker,butter'],

// ── POWDER / EVAPORATOR SPECIFIC ─────────────────────────────────────
['EVAP-TUBE-BUNDLE','Evaporator Tube Bundle (Replacement)','TUBE BUNDLE, EVAPORATOR, FALLING FILM, SS','GEA','FLUID','Evaporator Parts','EA',5000,15000,30,'{"material":"316L SS"}',null,'["EVAPORATOR"]','tube,bundle,evaporator,falling,film'],
['EVAP-VACUUM-PUMP','Evaporator Vacuum Pump Liquid Ring','PUMP, VACUUM, LIQUID RING, EVAPORATOR','Nash/Gardner Denver','FLUID','Evaporator Parts','EA',3000,8000,21,null,null,'["EVAPORATOR"]','pump,vacuum,liquid,ring,evaporator'],
['DRYER-NOZZLE','Spray Dryer Atomizer Nozzle','NOZZLE, ATOMIZER, SPRAY DRYER','GEA Niro','FLUID','Dryer Parts','EA',200,600,10,'{"material":"tungsten_carbide"}',null,'["SPRAY_DRYER"]','nozzle,atomizer,spray,dryer'],
['DRYER-BAG-FILTER','Spray Dryer Bag Filter (Set of 20)','FILTER BAG, SPRAY DRYER, SET/20','Donaldson','FILTERS','Dryer Parts','SET',300,800,10,'{"qty":20,"material":"polyester"}',null,'["SPRAY_DRYER"]','filter,bag,spray,dryer,baghouse'],
['DRYER-CYCLONE-LINER','Spray Dryer Cyclone Liner SS','LINER, CYCLONE, SPRAY DRYER, SS','GEA Niro','HARDWARE','Dryer Parts','EA',500,1500,14,null,null,'["SPRAY_DRYER"]','liner,cyclone,spray,dryer'],
['POWDER-SIFTER-SCREEN','Powder Sifter Screen Mesh 60','SCREEN, SIFTER, POWDER, MESH 60, SS','Kason','HARDWARE','Dryer Parts','EA',80,200,5,'{"mesh":60}',null,'["Powder Sifter"]','screen,sifter,powder,mesh'],

// ── RECEIVING / RAW MILK ─────────────────────────────────────────────
['RECV-HOSE-3IN','Receiving Hose 3in ID 20ft SS Braid','HOSE, RECEIVING, 3in ID, 20FT, SS BRAID','Continental','FLUID','Receiving','EA',200,500,5,'{"id_in":3,"length_ft":20}',null,'["Receiving Bay"]','hose,receiving,3inch,raw,milk'],
['RECV-PUMP-5HP','Raw Milk Receiving Pump 5HP Centrifugal SS','PUMP, RECEIVING, 5HP, CENTRIFUGAL, SS','Fristam','FLUID','Receiving','EA',3000,6000,14,'{"hp":5}',null,'["Receiving Bay"]','pump,receiving,raw,milk,5hp'],
['RECV-AIR-ELIM','Air Eliminator / De-Aerator Sanitary','AIR ELIMINATOR, DE-AERATOR, SANITARY, SS','Alfa Laval','FLUID','Receiving','EA',800,2000,10,null,null,'["Receiving","Process"]','air,eliminator,deaerator,sanitary'],
['RECV-STRAINER-INLINE','Inline Strainer 3in Sanitary SS','STRAINER, IN-LINE, 3in, SANITARY, SS','Central States','FLUID','Receiving','EA',120,300,5,'{"size_in":3}',null,'["Receiving","Process"]','strainer,inline,sanitary,3inch'],
['SILO-LEVEL-RADAR','Silo Level Transmitter Radar Non-Contact','TRANSMITTER, LEVEL, RADAR, SILO, NON-CONTACT','Endress+Hauser','ELECTRICAL','Level','EA',800,2200,10,'{"type":"radar","application":"silo"}',null,'["Silo","Large Tank"]','level,transmitter,radar,silo'],
['SILO-AGITATOR-5HP','Silo Agitator 5HP SS Low Speed','AGITATOR, SILO, 5HP, SS, LOW SPEED','SPX FLOW','FLUID','Tank Equipment','EA',3000,6500,14,'{"hp":5,"speed":"low"}',null,'["Silo"]','agitator,silo,5hp,low,speed'],

// ── NETWORKING / CONTROLS ────────────────────────────────────────────
['SWITCH-ETHERNET-8','Industrial Ethernet Switch 8-Port DIN Rail','SWITCH, ETHERNET, 8-PORT, DIN RAIL, INDUSTRIAL','Stratix/Allen-Bradley','ELECTRICAL','Networking','EA',200,450,3,'{"ports":8,"type":"managed"}','["Hirschmann RS20","Phoenix FL SWITCH"]','["Control Panel","PLC"]','switch,ethernet,industrial,8port'],
['SWITCH-ETHERNET-16','Industrial Ethernet Switch 16-Port DIN Rail','SWITCH, ETHERNET, 16-PORT, DIN RAIL, INDUSTRIAL','Stratix/Allen-Bradley','ELECTRICAL','Networking','EA',400,800,5,'{"ports":16}','["Hirschmann RS30"]','["MCC","Server Room"]','switch,ethernet,industrial,16port'],
['AB-1769-ECR','CompactLogix End Cap/Terminator','MODULE, END CAP, 1769-ECR, COMPACTLOGIX','Allen-Bradley','ELECTRICAL','PLC I/O','EA',15,35,1,null,null,'["PLC Rack"]','plc,end,cap,terminator,1769'],
['AB-1734-IB8','Point I/O 8-Pt Digital Input Module','MODULE, DIGITAL INPUT, 8-PT, 1734-IB8','Allen-Bradley','ELECTRICAL','PLC I/O','EA',100,200,3,'{"points":8,"type":"digital_input"}',null,'["Remote I/O"]','plc,point,io,digital,input'],
['AB-1734-OB8','Point I/O 8-Pt Digital Output Module','MODULE, DIGITAL OUTPUT, 8-PT, 1734-OB8','Allen-Bradley','ELECTRICAL','PLC I/O','EA',120,240,3,'{"points":8,"type":"digital_output"}',null,'["Remote I/O"]','plc,point,io,digital,output'],
['AB-ENET-CABLE-25','Industrial Ethernet Cable Cat6 25ft Shielded','CABLE, ETHERNET, CAT6, 25FT, SHIELDED, INDUSTRIAL','Allen-Bradley','ELECTRICAL','Networking','EA',20,50,1,'{"length_ft":25,"type":"Cat6","shielded":true}','["Belden","Panduit"]','["PLC","Panel"]','cable,ethernet,cat6,industrial'],

// ── ADDITIONAL HARDWARE ──────────────────────────────────────────────
['SS-HEX-5/16-18x1','Hex Bolt 5/16-18 x 1in 316 SS (Box/25)','BOLT, HEX, 5/16-18 x 1in, 316 SS, BOX/25','Generic','HARDWARE','Fasteners','BX',10,22,1,null,null,'["All Dairy"]','bolt,hex,stainless,5/16'],
['SS-HEX-5/8-11x2','Hex Bolt 5/8-11 x 2in 316 SS (Box/10)','BOLT, HEX, 5/8-11 x 2in, 316 SS, BOX/10','Generic','HARDWARE','Fasteners','BX',22,48,1,null,null,'["All Dairy"]','bolt,hex,stainless,5/8'],
['THREAD-TAPE-PTFE','Thread Tape PTFE 1/2in x 520in','TAPE, THREAD, PTFE, 1/2in x 520in','Generic','HARDWARE','Sealants','ROLL',1,3,1,null,null,'["All Plumbing"]','tape,thread,ptfe,teflon'],
['PIPE-DOPE-8OZ','Pipe Joint Compound 8oz','COMPOUND, PIPE JOINT, 8OZ','Rectorseal','HARDWARE','Sealants','EA',4,10,1,null,'["Permatex","Oatey"]','["All Plumbing"]','pipe,dope,joint,compound'],
['SILICONE-RTV-CLEAR','RTV Silicone Sealant Clear 3oz','SEALANT, RTV SILICONE, CLEAR, 3OZ','Permatex','HARDWARE','Sealants','EA',5,12,1,null,null,'["General"]','silicone,rtv,sealant,clear'],
['LOCTITE-242-10ML','Loctite 242 Medium Threadlocker 10ml','THREADLOCKER, MEDIUM, LOCTITE 242, 10ML','Loctite','HARDWARE','Sealants','EA',6,14,1,null,null,'["General"]','loctite,threadlocker,242,medium'],
['LOCTITE-271-10ML','Loctite 271 High Strength Threadlocker 10ml','THREADLOCKER, HIGH, LOCTITE 271, 10ML','Loctite','HARDWARE','Sealants','EA',7,16,1,null,null,'["General"]','loctite,threadlocker,271,high'],
['ANTI-SEIZE-8OZ','Anti-Seize Compound SS Grade 8oz','COMPOUND, ANTI-SEIZE, SS GRADE, 8OZ','Loctite','HARDWARE','Sealants','EA',10,25,1,'{"grade":"stainless_steel"}','["Permatex","Never-Seez"]','["All SS Fasteners"]','anti-seize,compound,stainless'],
['WIRE-14AWG-500','Wire THHN 14AWG Stranded 500ft','WIRE, THHN, 14AWG, STRANDED, 500FT','Southwire','ELECTRICAL','Wire','ROLL',50,95,2,'{"gauge":"14AWG"}',null,'["Control Wiring"]','wire,thhn,14awg'],
['WIRE-10AWG-500','Wire THHN 10AWG Stranded 500ft','WIRE, THHN, 10AWG, STRANDED, 500FT','Southwire','ELECTRICAL','Wire','ROLL',85,160,2,'{"gauge":"10AWG"}',null,'["Motor Wiring"]','wire,thhn,10awg'],
['CONDUIT-EMT-1-10','EMT Conduit 1in x 10ft','CONDUIT, EMT, 1in, 10FT','Allied','ELECTRICAL','Conduit','EA',8,18,1,'{"size_in":1}',null,'["Electrical"]','conduit,emt,1inch'],
['CONDUIT-FLEX-3/4','Liquid Tight Flex Conduit 3/4in (50ft)','CONDUIT, LIQUID TIGHT, FLEX, 3/4in, 50FT','Hubbell','ELECTRICAL','Conduit','ROLL',40,90,2,'{"size_in":0.75,"length_ft":50}','["AFC Afc","Thomas & Betts"]','["Motor Connection"]','conduit,liquid,tight,flex,3/4'],
['CONDUIT-FLEX-1','Liquid Tight Flex Conduit 1in (50ft)','CONDUIT, LIQUID TIGHT, FLEX, 1in, 50FT','Hubbell','ELECTRICAL','Conduit','ROLL',50,110,2,'{"size_in":1}',null,'["Motor Connection"]','conduit,liquid,tight,flex,1inch'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
console.log(`✅ Batch 7: ${parts.length} parts seeded`);
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterParts GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏆 Total parts in catalog: ${total}`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
db.close();
