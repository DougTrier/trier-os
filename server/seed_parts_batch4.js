// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Batch 4: Warranty Templates, Cross-References, + More Parts
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

// ── WARRANTY TEMPLATES ───────────────────────────────────────────────
const insW = db.prepare(`INSERT OR REPLACE INTO MasterWarrantyTemplates (EquipmentType,VendorID,TypicalMonths,CoverageDescription,Exclusions,ClaimProcess,ExtendedOptions) VALUES (?,?,?,?,?,?,?)`);
const warranties = [
['HTST_PASTEURIZER','SPX_FLOW',24,'Full parts & labor on heat exchanger plates, gaskets, frame, and controls. Includes 2 service visits/year.','Normal wear items (gaskets, O-rings, seals). Damage from improper CIP chemicals. Unauthorized modifications.','Contact SPX FLOW Regional Service Manager. Submit warranty claim form with photos. 5 business day response SLA.','Extended to 36mo available at 8% of equipment cost. Extended to 60mo at 15%.'],
['HTST_PASTEURIZER','ALFA_LAVAL',18,'Parts & labor on plates, frame, and control instrumentation.','Gaskets, seals, and consumable wear items. Chemical damage. Electrical surge damage.','Contact Alfa Laval Service Center. Provide serial number and failure description.','Extended 12mo increments available.'],
['HTST_PASTEURIZER','TETRA_PAK',24,'Comprehensive parts & labor including controls, valves, and instrumentation. 24/7 remote diagnostics included.','Consumable gaskets and seals. Damage from non-approved chemicals. Third-party modifications.','Call Tetra Pak 24/7 hotline. On-site service within 24 hours for critical failures.','Performance guarantee packages available (uptime SLA).'],
['HOMOGENIZER','GEA_GROUP',18,'Plunger pumps, valve assemblies, crankcase, and motor. Covers defects in materials and workmanship.','Plunger seals, valve seats (wear items). Damage from foreign objects. Operating beyond rated pressure.','Submit RMA through GEA MyServicePortal. Parts shipped within 48 hours.','Extended to 36mo at 10% of purchase price.'],
['HOMOGENIZER','SPX_FLOW',18,'High pressure pump assembly, valves, crankcase, and controls.','Wear items: plunger seals, valve seats, piston rings. Damage from contaminated product.','Contact SPX FLOW service. Provide model, serial, and failure description.','Extended warranty with PM contract available.'],
['SEPARATOR','GEA_GROUP',24,'Bowl assembly, feed pump, motor, gear train, and controls. Vibration monitoring included first year.','Bowl discs (wear items). Damage from foreign objects or out-of-balance operation.','Contact GEA Westfalia service. On-site diagnosis within 48 hours.','Rebuild program available at 60% of new unit cost.'],
['SEPARATOR','ALFA_LAVAL',24,'Complete separator including bowl, motor, and controls.','Disc stack, sealing ring (wear items). Damage from improper startup procedures.','Alfa Laval Service Agreement required for warranty claims.','Extended service agreements with guaranteed rebuild pricing.'],
['GALLON_FILLER','EVERGREEN',12,'Fill heads, carton forming assembly, date coder interface, and conveyor sections.','Fill head gaskets, carton knife blades, glue nozzles (consumables). Damage from non-approved carton stock.','Contact Evergreen Technical Support. Photo/video documentation required.','Extended to 24mo at 12% of equipment cost.'],
['PALLETIZER','FANUC',24,'Robotic arm, controller, teach pendant, and all servo drives. 24/7 remote diagnostics via ZDT.','End-of-arm tooling, vacuum cups, grippers (wear items). Damage from collision or overload.','FANUC CRC (Customer Resource Center) 24/7 hotline. Remote diagnosis first, then on-site if needed.','Extended to 48mo with FANUC Service Plus agreement.'],
['PALLETIZER','ABB_ROBOT',24,'Robot arm, IRC5 controller, FlexPendant, and servo motors.','Grippers, vacuum cups, cables subject to wear. Cosmetic damage.','ABB Service Portal. Remote access diagnosis standard.','ABB Care agreements: Preventive, Corrective, or Comprehensive tiers.'],
['CIP_SYSTEM','SANI_MATIC',18,'Tanks, pumps, valves, heat exchangers, and PLC controls.','Chemical hoses, gaskets, spray balls (consumables). Chemical damage from unapproved agents.','Contact Sani-Matic service department with system serial number.','Annual PM contract extends warranty 12mo/year.'],
['BOILER','CLEAVER_BROOKS',24,'Pressure vessel, burner assembly, feedwater system, and controls. Limited to defects in materials and workmanship.','Refractory, gaskets, ignitors (consumables). Damage from water treatment failure. Code violations.','Must use authorized Cleaver-Brooks service provider. Boiler inspection report required with claim.','Extended boiler care programs with annual inspection included.'],
['AIR_COMPRESSOR','ATLAS_COPCO',24,'Air end, motor, coolers, separator tank, and Elektronikon controller.','Oil, filters, belts, separator elements (consumables). Damage from contaminated intake air.','Atlas Copco SMARTLINK remote monitoring triggers automatic service alerts.','Total Responsibility Plan: fixed-cost coverage including consumables.'],
['AIR_COMPRESSOR','INGERSOLL',24,'Airend assembly, motor, and controls.','Filters, oil, belts, separator elements. Electrical surge damage.','Contact local Ingersoll Rand distributor. Provide unit serial and hours.','Extended warranty with Assurance service agreement.'],
['VFD','ALLEN_BRADLEY',24,'Drive module, power section, and keypad. Covers component failure under normal operating conditions.','Cooling fans (consumable). Damage from power surges, incorrect wiring, or environmental contamination.','Rockwell Automation TechConnect support. RMA process for drive replacement.','Extended to 60mo with Rockwell Assurance program.'],
['MOTOR_3PH','BALDOR',36,'Motor winding, bearings, shaft, and frame. Covers defects in materials and workmanship.','Normal bearing wear after 3 years. Damage from overload, undervoltage, or environmental exposure.','Return motor to authorized Baldor service center. Nameplate data required.','Baldor Permanent Magnet motors: 60mo warranty standard.'],
['MOTOR_3PH','WEG',36,'Complete motor including windings, bearings, and terminal box.','Bearing wear. Damage from voltage imbalance, overload, or improper installation.','Contact WEG authorized distributor. Motor must be returned for inspection.','WEG W22 Premium Efficiency line: 60mo standard.'],
['FORKLIFT_ELEC','TOYOTA_FL',36,'Drivetrain, hydraulic system, mast assembly, and electrical system. 6000 operating hours.','Tires, brake pads, forks, seats (wear items). Battery not included. Attachments excluded.','Toyota dealer service department. Must maintain service records per warranty schedule.','Toyota 360 Support: comprehensive coverage including PM.'],
['METAL_DETECTOR','METTLER_TOLEDO',12,'Detector head, conveyor, reject mechanism, and controller.','Belt, rollers, reject air cylinders (consumables). Damage from product impact.','Mettler Toledo Service hotline. Remote diagnosis available on connected units.','Performance verification service agreements available (IQ/OQ/PQ).'],
['FLOW_METER','ENDRESS',24,'Sensor, transmitter, and electronics. Covers drift beyond specified accuracy.','O-rings, gaskets (consumables). Damage from water hammer or process abuse.','Endress+Hauser W@M portal for warranty registration and claims.','Heartbeat Technology self-verification reduces calibration costs.'],
];

const txW = db.transaction(() => { for (const w of warranties) insW.run(...w); });
txW();
console.log(`   ✅ ${warranties.length} warranty templates seeded`);

// ── CROSS-REFERENCES ─────────────────────────────────────────────────
const insX = db.prepare(`INSERT OR REPLACE INTO MasterCrossRef (OEMPartNumber,OEMVendor,AftermarketPartNumber,AftermarketVendor,CompatibilityNotes,Verified) VALUES (?,?,?,?,?,?)`);
const xrefs = [
// Bearings
['SKF 6205-2RS','SKF','NTN 6205LLU','NTN','Direct interchange. Same dimensions 25x52x15mm.',1],
['SKF 6205-2RS','SKF','NSK 6205DDU','NSK','Direct interchange. NSK uses DDU seal designation.',1],
['SKF 6205-2RS','SKF','FAG 6205-C-2HRS','FAG/Schaeffler','Direct interchange. FAG uses C-2HRS designation.',1],
['SKF 6205-2RS','SKF','Timken 205PP','Timken','Direct interchange. Timken uses 205PP for sealed.',1],
['SKF 6208-2RS','SKF','NTN 6208LLU','NTN','Direct interchange 40x80x18mm.',1],
['SKF 6310-2RS','SKF','NTN 6310LLU','NTN','Direct interchange 50x110x27mm.',1],
// Motors
['Baldor EM3554T','Baldor/ABB','WEG 01518ET3E145TC','WEG','Direct replacement 1.5HP 145TC. Verify rotation direction.',1],
['Baldor EM3615T','Baldor/ABB','WEG 05018ET3E184TC','WEG','Direct replacement 5HP 184TC. Match voltage config.',1],
['Baldor EM3615T','Baldor/ABB','Marathon 184TTFNA6570','Marathon/Regal','Direct replacement 5HP 184TC. Check conduit box position.',1],
// VFDs
['AB PowerFlex 525 1HP','Allen-Bradley','ABB ACS355-03U-04A7-2','ABB','Functional equivalent 1HP 480V. Different parameter structure — requires reprogramming.',0],
['AB PowerFlex 525 5HP','Allen-Bradley','Siemens V20 6SL3210-5BE25-5UV0','Siemens','Functional equivalent 5HP 480V. Different programming — verify with controls engineer.',0],
// Pumps - Seal cross-ref
['John Crane Type 21 1in','John Crane','Flowserve 168 1in','Flowserve','Functional equivalent mechanical seal. Verify seat and face materials match application.',1],
['John Crane Type 21 1in','John Crane','Chesterton 491 1in','Chesterton','Functional equivalent. Chesterton uses cartridge mount — verify fitment.',0],
// Sensors
['E+H Promag 10P 2in','Endress+Hauser','Yokogawa AXF 2in','Yokogawa','Functional equivalent mag flow. Different wiring/config. Pipe schedule must match.',0],
['E+H Promag 10P 2in','Endress+Hauser','Rosemount 8700 2in','Emerson','Functional equivalent. Different transmitter protocol — verify HART/Profibus compatibility.',0],
['Sick M12 Inductive','Sick','AB 872C-D5NP12-D4','Allen-Bradley','Functional equivalent M12 prox NPN. Verify cable connector type (M12 vs pigtail).',1],
['Sick M12 Inductive','Sick','IFM IFS204','IFM','Direct equivalent M12 NPN 4mm range. IFM uses IO-Link capable version.',1],
// Chain
['Rexnord 882 SS','Rexnord','Intralox S800','Intralox','Similar tabletop chain. Different pin/hinge design — verify return path clearance.',0],
// Fuses
['Mersen ATDR-15','Mersen','Bussmann FNQ-R-15','Eaton/Bussmann','Direct interchange Class CC 15A time delay.',1],
['Mersen ATDR-30','Mersen','Bussmann FRN-R-30','Eaton/Bussmann','Direct interchange Class RK5 30A time delay.',1],
];

const txX = db.transaction(() => { for (const x of xrefs) insX.run(...x); });
txX();
console.log(`   ✅ ${xrefs.length} cross-references seeded`);

// ── MORE PARTS: Batch 4 extras ───────────────────────────────────────
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const moreParts = [
// Additional bearings (common sizes)
['SKF-6203-2RS','Deep Groove Ball Bearing 17x40x12mm Sealed','BEARING, BALL, 6203-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',6,18,1,'{"bore_mm":17,"od_mm":40,"width_mm":12}','["NTN 6203LLU","NSK 6203DDU"]','["Small Motor","Pump"]','bearing,ball,6203'],
['SKF-6204-2RS','Deep Groove Ball Bearing 20x47x14mm Sealed','BEARING, BALL, 6204-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',7,20,1,'{"bore_mm":20,"od_mm":47,"width_mm":14}','["NTN 6204LLU","NSK 6204DDU"]','["Pump","Motor","Conveyor"]','bearing,ball,6204'],
['SKF-6312-2RS','Deep Groove Ball Bearing 60x130x31mm Sealed','BEARING, BALL, 6312-2RS, SEALED','SKF','BEARINGS','Ball Bearings','EA',35,95,2,'{"bore_mm":60}','["NTN 6312LLU"]','["Large Motor","Blower"]','bearing,ball,6312'],
// Coupling
['LOVEJOY-L100-JAW','Lovejoy L100 Jaw Coupling Complete Set','COUPLING, JAW, L100, COMPLETE SET','Lovejoy','HARDWARE','Couplings','EA',25,55,2,'{"size":"L100","type":"jaw"}','["Martin ML100"]','["Motor-Pump","Motor-Gearbox"]','coupling,jaw,lovejoy,l100'],
['LOVEJOY-L150-JAW','Lovejoy L150 Jaw Coupling Complete Set','COUPLING, JAW, L150, COMPLETE SET','Lovejoy','HARDWARE','Couplings','EA',40,85,2,null,'["Martin ML150"]','["Motor-Pump"]','coupling,jaw,l150'],
['LOVEJOY-SPIDER-L100','Spider Insert L100 NBR (Buna-N)','SPIDER, COUPLING, L100, NBR','Lovejoy','HARDWARE','Couplings','EA',6,15,1,'{"material":"NBR/Buna-N"}',null,'["Motor-Pump"]','spider,coupling,insert,l100'],
// More sanitary
['SAN-SAMPLE-VALVE-15','Sample Valve 1.5in Tri-Clamp SS','VALVE, SAMPLE, 1.5in, TRI-CLAMP, 316L SS','Central States','FLUID','Sanitary Valves','EA',35,85,3,null,null,'["HTST","Tank","Pipeline"]','valve,sample,sanitary,1.5'],
['SAN-SIGHT-GLASS-20','Sight Glass 2.0in Tri-Clamp SS','SIGHT GLASS, 2.0in, TRI-CLAMP, 316L SS','Central States','FLUID','Sanitary Fittings','EA',45,120,3,null,null,'["Tank","Line"]','sight,glass,sanitary,2inch'],
['SAN-DIAPHRAGM-VALVE-20','Diaphragm Valve 2.0in Tri-Clamp SS','VALVE, DIAPHRAGM, 2.0in, TRI-CLAMP, 316L SS','Alfa Laval','FLUID','Sanitary Valves','EA',250,600,7,null,null,'["CIP","Aseptic"]','valve,diaphragm,sanitary,2inch'],
// Hose
['HOSE-DAIRY-15-10FT','Dairy Hose 1.5in ID 10ft Tri-Clamp Ends','HOSE, DAIRY, 1.5in ID, 10FT, TRI-CLAMP ENDS','Continental','FLUID','Hoses','EA',60,140,3,'{"id_in":1.5,"length_ft":10,"material":"EPDM tube, SS braid","ends":"tri-clamp"}',null,'["Transfer","CIP","Tank"]','hose,dairy,sanitary,1.5,triclamp'],
['HOSE-DAIRY-20-10FT','Dairy Hose 2.0in ID 10ft Tri-Clamp Ends','HOSE, DAIRY, 2.0in ID, 10FT, TRI-CLAMP ENDS','Continental','FLUID','Hoses','EA',80,180,3,'{"id_in":2}',null,'["Transfer","CIP"]','hose,dairy,2inch,triclamp'],
// Actuators
['ACTUATOR-PNEU-SR-25','Pneumatic Actuator Spring Return 2.5in','ACTUATOR, PNEUMATIC, SPRING RETURN, 2.5in VALVE','Alfa Laval','PNEUMATIC','Actuators','EA',200,450,7,'{"type":"spring_return","valve_size_in":2.5}',null,'["Butterfly Valve","Mix-Proof"]','actuator,pneumatic,spring,return'],
['ACTUATOR-PNEU-DA-30','Pneumatic Actuator Double Acting 3.0in','ACTUATOR, PNEUMATIC, DOUBLE ACTING, 3.0in VALVE','Alfa Laval','PNEUMATIC','Actuators','EA',250,550,7,'{"type":"double_acting","valve_size_in":3}',null,'["Butterfly Valve"]','actuator,pneumatic,double,acting'],
['POSITIONER-SMART','Smart Positioner 4-20mA for Actuator','POSITIONER, SMART, 4-20mA, PNEUMATIC ACTUATOR','Samson','PNEUMATIC','Actuators','EA',350,800,7,null,'["Fisher DVC6200","ABB TZIDC"]','["Control Valve"]','positioner,smart,4-20ma,actuator'],
// Forklift
['FORK-TIRE-SOLID-18','Solid Tire 18x7x12-1/8 Press-On','TIRE, SOLID, 18x7x12-1/8, PRESS-ON, FORKLIFT','Continental','LOGISTICS','Forklift Parts','EA',120,280,5,'{"size":"18x7x12-1/8","type":"press-on"}',null,'["FORKLIFT_ELEC"]','tire,solid,forklift,press-on,18'],
['FORK-TIRE-SOLID-16','Solid Tire 16x6x10-1/2 Press-On','TIRE, SOLID, 16x6x10-1/2, PRESS-ON, FORKLIFT','Continental','LOGISTICS','Forklift Parts','EA',100,240,5,null,null,'["FORKLIFT_ELEC","FORKLIFT_LP"]','tire,solid,forklift,16'],
['FORK-BATTERY-36V','Forklift Battery 36V 750AH Industrial','BATTERY, FORKLIFT, 36V, 750AH, INDUSTRIAL','East Penn/Deka','LOGISTICS','Forklift Parts','EA',3500,6500,14,'{"voltage":36,"ah":750,"type":"lead-acid"}','["Enersys Hawker","GNB Industrial"]','["FORKLIFT_ELEC"]','battery,forklift,36v,industrial'],
['FORK-CHARGER-36V','Battery Charger 36V 100A','CHARGER, BATTERY, 36V, 100A, FORKLIFT','Ametek/Prestolite','LOGISTICS','Forklift Parts','EA',1200,2500,7,'{"voltage":36,"amps":100}','["Enersys EnForcer","GNB SCR"]','["FORKLIFT_ELEC"]','charger,battery,forklift,36v'],
// Ink jet coder
['VIDEOJET-INK-BLK-750','Videojet Ink Black 750ml Bottle','INK, VIDEOJET, BLACK, 750ML','Videojet','LUBRICANTS','Consumables','EA',80,150,3,null,null,'["DATE_CODER"]','ink,videojet,black,date,coder'],
['VIDEOJET-MAKEUP-750','Videojet Make-Up Solvent 750ml Bottle','SOLVENT, MAKE-UP, VIDEOJET, 750ML','Videojet','LUBRICANTS','Consumables','EA',50,100,3,null,null,'["DATE_CODER"]','solvent,makeup,videojet,coder'],
['VIDEOJET-FILTER-KIT','Videojet 1000 Series Filter Kit','FILTER KIT, VIDEOJET 1000 SERIES','Videojet','FILTERS','Consumables','KIT',40,90,3,null,null,'["DATE_CODER"]','filter,kit,videojet,coder'],
];

const txP = db.transaction(() => { for (const p of moreParts) ins.run(...p); });
txP();
console.log(`   ✅ ${moreParts.length} additional parts seeded`);

// ── Summary ──────────────────────────────────────────────────────────
const counts = {
  equipment: db.prepare('SELECT COUNT(*) as c FROM MasterEquipment').get().c,
  vendors: db.prepare('SELECT COUNT(*) as c FROM MasterVendors').get().c,
  parts: db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c,
  warranties: db.prepare('SELECT COUNT(*) as c FROM MasterWarrantyTemplates').get().c,
  crossrefs: db.prepare('SELECT COUNT(*) as c FROM MasterCrossRef').get().c,
};
console.log(`\n🏆 Dairy Master Data Catalog — Complete Summary:`);
console.log(`   📦 ${counts.equipment} Equipment Types`);
console.log(`   🏢 ${counts.vendors} Vendors`);
console.log(`   🔧 ${counts.parts} Parts`);
console.log(`   🛡️ ${counts.warranties} Warranty Templates`);
console.log(`   🔗 ${counts.crossrefs} Cross-References`);
db.close();
