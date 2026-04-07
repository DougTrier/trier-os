// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Parts Seed — Batch 9: BREAK 500! Final gap fill
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));
const ins = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID,Description,StandardizedName,Manufacturer,Category,SubCategory,UOM,TypicalPriceMin,TypicalPriceMax,LeadTimeDays,Specifications,AlternatePartNumbers,EquipmentTypes,Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const parts = [
// Additional V-Belts
['GATES-A42','V-Belt A42 Classical','BELT, V, A42, CLASSICAL','Gates','HARDWARE','V-Belts','EA',6,14,1,'{"section":"A","length_in":44}','["Browning A42"]','["Motor","Pump"]','belt,v,a42'],
['GATES-A55','V-Belt A55 Classical','BELT, V, A55, CLASSICAL','Gates','HARDWARE','V-Belts','EA',7,16,1,null,'["Browning A55"]','["Motor","Blower"]','belt,v,a55'],
['GATES-B62','V-Belt B62 Classical','BELT, V, B62, CLASSICAL','Gates','HARDWARE','V-Belts','EA',10,22,1,null,'["Browning B62"]','["Motor"]','belt,v,b62'],
['GATES-B90','V-Belt B90 Classical','BELT, V, B90, CLASSICAL','Gates','HARDWARE','V-Belts','EA',14,32,1,null,null,'["Blower","Compressor"]','belt,v,b90'],
['GATES-B100','V-Belt B100 Classical','BELT, V, B100, CLASSICAL','Gates','HARDWARE','V-Belts','EA',16,36,1,null,null,'["Large Blower"]','belt,v,b100'],
['GATES-C120','V-Belt C120 Classical','BELT, V, C120, CLASSICAL','Gates','HARDWARE','V-Belts','EA',22,50,2,'{"section":"C"}',null,'["Large Motor","Compressor"]','belt,v,c120,heavy'],
// Couplings
['LOVEJOY-L070-JAW','Lovejoy L070 Jaw Coupling Set','COUPLING, JAW, L070, COMPLETE SET','Lovejoy','HARDWARE','Couplings','EA',18,40,2,null,null,'["Small Motor-Pump"]','coupling,jaw,l070'],
['LOVEJOY-L190-JAW','Lovejoy L190 Jaw Coupling Set','COUPLING, JAW, L190, COMPLETE SET','Lovejoy','HARDWARE','Couplings','EA',55,120,2,null,null,'["Motor-Pump"]','coupling,jaw,l190'],
['LOVEJOY-SPIDER-L150','Spider Insert L150 NBR','SPIDER, COUPLING, L150, NBR','Lovejoy','HARDWARE','Couplings','EA',8,20,1,null,null,'["Motor-Pump"]','spider,coupling,l150'],
['LOVEJOY-SPIDER-L190','Spider Insert L190 NBR','SPIDER, COUPLING, L190, NBR','Lovejoy','HARDWARE','Couplings','EA',12,28,1,null,null,'["Motor-Pump"]','spider,coupling,l190'],
// More chains
['REXNORD-40-CL','Connecting Link #40 Single','LINK, CONNECTING, #40, SINGLE STRAND','Rexnord','HARDWARE','Roller Chain','EA',2,6,1,null,'["Martin CL40"]','["Conveyor"]','chain,connecting,link,40'],
['REXNORD-50-CL','Connecting Link #50 Single','LINK, CONNECTING, #50, SINGLE STRAND','Rexnord','HARDWARE','Roller Chain','EA',3,8,1,null,'["Martin CL50"]','["Conveyor"]','chain,connecting,link,50'],
['REXNORD-60-CL','Connecting Link #60 Single','LINK, CONNECTING, #60, SINGLE STRAND','Rexnord','HARDWARE','Roller Chain','EA',4,10,1,null,'["Martin CL60"]','["Conveyor"]','chain,connecting,link,60'],
['REXNORD-40-OL','Offset Link #40 Single','LINK, OFFSET, #40, SINGLE STRAND','Rexnord','HARDWARE','Roller Chain','EA',3,8,1,null,null,'["Conveyor"]','chain,offset,link,40'],
['REXNORD-50-OL','Offset Link #50 Single','LINK, OFFSET, #50, SINGLE STRAND','Rexnord','HARDWARE','Roller Chain','EA',4,10,1,null,null,'["Conveyor"]','chain,offset,link,50'],
// More sprockets
['MARTIN-40B15','Sprocket #40 15-Tooth B-Hub','SPROCKET, #40, 15T, B-HUB','Martin','HARDWARE','Sprockets','EA',10,24,2,null,null,'["Conveyor"]','sprocket,40,15tooth'],
['MARTIN-40B24','Sprocket #40 24-Tooth B-Hub','SPROCKET, #40, 24T, B-HUB','Martin','HARDWARE','Sprockets','EA',14,34,2,null,null,'["Conveyor"]','sprocket,40,24tooth'],
['MARTIN-50B15','Sprocket #50 15-Tooth B-Hub','SPROCKET, #50, 15T, B-HUB','Martin','HARDWARE','Sprockets','EA',14,35,2,null,null,'["Conveyor"]','sprocket,50,15tooth'],
['MARTIN-50B24','Sprocket #50 24-Tooth B-Hub','SPROCKET, #50, 24T, B-HUB','Martin','HARDWARE','Sprockets','EA',20,50,2,null,null,'["Conveyor"]','sprocket,50,24tooth'],
['MARTIN-60B18','Sprocket #60 18-Tooth B-Hub','SPROCKET, #60, 18T, B-HUB','Martin','HARDWARE','Sprockets','EA',22,55,2,null,null,'["Conveyor"]','sprocket,60,18tooth'],
// Additional safety/cleaning
['FACE-SHIELD-CLEAR','Face Shield Clear Full Length','SHIELD, FACE, CLEAR, FULL LENGTH','3M','SAFETY','Eye Protection','EA',8,20,1,null,'["Honeywell","MSA"]','["Chemical Areas"]','face,shield,clear,ppe'],
['RAIN-SUIT-XL','Rain Suit 2-Piece XL','SUIT, RAIN, 2-PIECE, XL','Tingley','SAFETY','Clothing','EA',15,35,1,null,null,'["Outdoor","Washdown"]','rain,suit,ppe'],
['RUBBER-BOOTS-11','Rubber Boots White Size 11','BOOTS, RUBBER, WHITE, SIZE 11','Onguard','SAFETY','Footwear','PR',20,45,2,'{"size":11,"color":"white"}',null,'["Dairy Processing"]','boots,rubber,white,dairy'],
['HAIR-NET-BX144','Hair Net Nylon Box/144','HAIR NET, NYLON, BOX/144','Generic','SAFETY','Hygiene','BX',8,18,1,null,null,'["All Processing"]','hair,net,nylon,hygiene'],
['BEARD-NET-BX100','Beard Net Nylon Box/100','BEARD NET, NYLON, BOX/100','Generic','SAFETY','Hygiene','BX',6,14,1,null,null,'["All Processing"]','beard,net,hygiene'],
['APRON-DISPOSABLE-100','Disposable Apron Poly Box/100','APRON, DISPOSABLE, POLY, BOX/100','Generic','SAFETY','Hygiene','BX',10,22,1,null,null,'["Processing"]','apron,disposable,poly'],
// Additional lubes
['LUBE-PENETRANT-12','Penetrating Lubricant Spray 12oz','LUBRICANT, PENETRATING, SPRAY, 12OZ','PB Blaster','LUBRICANTS','Maintenance','EA',5,12,1,null,'["WD-40","Liquid Wrench"]','["Maintenance"]','penetrating,lubricant,spray'],
['LUBE-CONTACT-CLEAN','Electrical Contact Cleaner 11oz','CLEANER, CONTACT, ELECTRICAL, 11OZ','CRC','LUBRICANTS','Maintenance','EA',6,14,1,null,'["DeoxIT","WD-40 Specialist"]','["Electrical"]','contact,cleaner,electrical'],
['LUBE-DIELECTRIC','Dielectric Grease Tube 3oz','GREASE, DIELECTRIC, 3OZ TUBE','Permatex','LUBRICANTS','Maintenance','EA',4,10,1,null,null,'["Electrical Connections"]','grease,dielectric,electrical'],
['LUBE-SILICONE-SPRAY','Silicone Spray Lubricant 11oz Food Grade','LUBRICANT, SILICONE, SPRAY, 11OZ, FOOD GRADE','CRC','LUBRICANTS','Food Grade','EA',7,16,1,'{"grade":"H1"}',null,'["Conveyors","Guides","O-Rings"]','silicone,spray,food,grade,h1'],
// Misc electrical
['TERMINAL-BLOCK-30A','Terminal Block 30A DIN Rail','TERMINAL BLOCK, 30A, DIN RAIL','Phoenix Contact','ELECTRICAL','Terminals','EA',3,8,1,null,'["Allen-Bradley 1492","Weidmuller"]','["Control Panel"]','terminal,block,30a,din,rail'],
['TERMINAL-BLOCK-GRND','Ground Terminal Block DIN Rail','TERMINAL BLOCK, GROUND, DIN RAIL','Phoenix Contact','ELECTRICAL','Terminals','EA',3,8,1,null,null,'["Control Panel"]','terminal,block,ground,din'],
['DIN-RAIL-35MM-1M','DIN Rail 35mm x 1 Meter','RAIL, DIN, 35mm, 1 METER, SLOTTED','Phoenix Contact','ELECTRICAL','Panel Hardware','EA',6,15,1,null,null,'["Control Panel"]','din,rail,35mm,panel'],
['WIRE-DUCT-2x2-6FT','Wire Duct 2x2in 6ft Slotted','DUCT, WIRE, 2x2in, 6FT, SLOTTED','Panduit','ELECTRICAL','Panel Hardware','EA',10,25,1,null,'["Hoffman"]','["Control Panel"]','wire,duct,2x2,slotted,panduit'],
['WIRE-DUCT-3x3-6FT','Wire Duct 3x3in 6ft Slotted','DUCT, WIRE, 3x3in, 6FT, SLOTTED','Panduit','ELECTRICAL','Panel Hardware','EA',14,32,1,null,null,'["Control Panel"]','wire,duct,3x3,slotted'],
];

const tx = db.transaction(() => { for (const p of parts) ins.run(...p); });
tx();
const total = db.prepare('SELECT COUNT(*) as c FROM MasterParts').get().c;
const cats = db.prepare('SELECT Category, COUNT(*) as c FROM MasterParts GROUP BY Category ORDER BY c DESC').all();
console.log(`\n🏆🏆🏆 FINAL COUNT: ${total} PARTS! 🏆🏆🏆`);
for (const c of cats) console.log(`   ${c.Category}: ${c.c}`);
console.log(`\n   THE HOLY GRAIL IS COMPLETE! 🎯`);
db.close();
