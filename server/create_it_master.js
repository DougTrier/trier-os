// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — IT Master Data Catalog
 * ====================================
 * Creates it_master.db — the IT asset knowledge base.
 * Covers 7 years of product lifecycle for Zebra, Fortinet, Dell, Samsung
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');

const dbPath = path.join(dataDir, 'it_master.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🖥️  Creating IT Master Data Catalog...');
console.log(`   Path: ${dbPath}`);

// ── Schema ─────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS ITMasterProducts (
    PartNumber TEXT PRIMARY KEY,
    ProductName TEXT NOT NULL,
    Manufacturer TEXT NOT NULL,
    Category TEXT,
    SubCategory TEXT,
    ProductType TEXT,
    Description TEXT,
    Specifications TEXT,
    UOM TEXT DEFAULT 'EA',
    ListPriceMin REAL,
    ListPriceMax REAL,
    LifecycleStatus TEXT DEFAULT 'Active',
    IntroducedYear INTEGER,
    EOLYear INTEGER,
    WarrantyMonths INTEGER,
    LeadTimeDays INTEGER,
    Weight TEXT,
    Dimensions TEXT,
    PowerRequirements TEXT,
    AlternatePartNumbers TEXT,
    SupersededBy TEXT,
    Tags TEXT
);

CREATE TABLE IF NOT EXISTS ITMasterAccessories (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    ParentPartNumber TEXT NOT NULL,
    AccessoryPartNumber TEXT NOT NULL,
    AccessoryName TEXT,
    AccessoryType TEXT,
    Required INTEGER DEFAULT 0,
    Notes TEXT,
    FOREIGN KEY (ParentPartNumber) REFERENCES ITMasterProducts(PartNumber)
);

CREATE TABLE IF NOT EXISTS ITMasterVendors (
    VendorID TEXT PRIMARY KEY,
    CompanyName TEXT NOT NULL,
    Website TEXT,
    Phone TEXT,
    SupportPhone TEXT,
    PartnerLevel TEXT,
    Categories TEXT,
    Region TEXT DEFAULT 'National',
    WarrantyPolicy TEXT,
    SupportSLA TEXT,
    SalesRepName TEXT,
    SalesRepEmail TEXT,
    SalesRepPhone TEXT
);
`);

console.log('   ✅ Schema created (3 tables)');

// ══════════════════════════════════════════════════════════════════════════════
// MASTER PRODUCTS — Zebra, Fortinet, Dell, Samsung — 7-year product lifecycle
// ══════════════════════════════════════════════════════════════════════════════

const insProd = db.prepare(`INSERT OR REPLACE INTO ITMasterProducts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const products = [
    // ═══════════════ ZEBRA — Rugged Mobile Computers ═══════════════
    // Current Generation
    ['MC9300-G','MC9300 Rugged Mobile Computer','Zebra Technologies','Mobile','Rugged Scanner','Handheld','Ultimate rugged touch computer with integrated scanner. Android platform with SOTI MDM support.',
     '{"os":"Android 10/11","display":"4.3in WVGA","scanner":"SE4850-SR/LR","cpu":"Qualcomm SD660","ram":"4GB","storage":"32GB","battery":"7000mAh","ip_rating":"IP65/IP67","drop":"8ft/2.4m to concrete","temp":"-20°C to 50°C","wifi":"802.11ac","bluetooth":"5.0","weight":"765g"}',
     'EA',3200,4200,'Active',2019,2029,36,14,'1.68 lbs','8.71 x 3.47 x 7.32 in','USB-C charging cradle, 7000mAh battery',null,null,'rugged,scanner,warehouse,android,soti'],
    ['MC9400-G','MC9400 Rugged Mobile Computer','Zebra Technologies','Mobile','Rugged Scanner','Handheld','Next-gen ultra-rugged mobile computer. Wi-Fi 6E, 5G optional. Replaces MC9300.',
     '{"os":"Android 13/14","display":"4.3in WVGA","scanner":"SE58-SR/LR","cpu":"Qualcomm QCM6490","ram":"6GB","storage":"64/128GB","battery":"7000mAh","ip_rating":"IP65/IP68","drop":"10ft/3m to concrete","temp":"-30°C to 50°C","wifi":"Wi-Fi 6E","bluetooth":"5.2","5g":"optional","weight":"740g"}',
     'EA',3800,5200,'Active',2023,2033,36,14,'1.63 lbs','8.58 x 3.47 x 7.24 in','USB-C, backward compatible with MC9300 accessories','MC9300-G',null,'rugged,scanner,warehouse,android,5g,wifi6e'],
    ['MC3300-G','MC3300ax Mobile Computer','Zebra Technologies','Mobile','Rugged Scanner','Handheld','Versatile gun-style rugged mobile. Ideal for warehouse and production floor scanning.',
     '{"os":"Android 11","display":"4.0in WVGA","scanner":"SE4770/SE4850","cpu":"Qualcomm SD660","ram":"4GB","storage":"32GB","battery":"5200mAh","ip_rating":"IP54","drop":"6ft/1.8m","temp":"-20°C to 50°C","wifi":"Wi-Fi 6","bluetooth":"5.1","weight":"490g"}',
     'EA',1800,2800,'Active',2021,2031,36,10,'1.08 lbs','8.19 x 3.07 x 6.50 in','USB-C cradle',null,null,'rugged,scanner,warehouse,android'],
    ['TC72-G','TC72 Touch Computer','Zebra Technologies','Mobile','Touch Computer','Handheld','All-touch enterprise mobile computer. Smartphone-like form factor for field and production use.',
     '{"os":"Android 10","display":"4.7in FHD","scanner":"SE4710","cpu":"Qualcomm SD660","ram":"4GB","storage":"32GB","battery":"4620mAh","ip_rating":"IP67","drop":"5ft/1.5m","temp":"-20°C to 50°C","wifi":"802.11ac","bluetooth":"5.0","weight":"236g"}',
     'EA',1200,1800,'Active',2018,2028,36,7,'0.52 lbs','6.15 x 2.97 x 0.55 in','USB-C, Qi wireless charging optional',null,'TC73-G','rugged,touch,field,android'],
    ['TC77-G','TC77 Touch Computer','Zebra Technologies','Mobile','Touch Computer','Handheld','TC72 with cellular (4G LTE). Enterprise smartphone replacement for field workers.',
     '{"os":"Android 10","display":"4.7in FHD","scanner":"SE4710","cpu":"Qualcomm SD660","ram":"4GB","storage":"32GB","battery":"4620mAh","ip_rating":"IP67","drop":"5ft/1.5m","lte":"4G LTE Cat 13","wifi":"802.11ac","bluetooth":"5.0","weight":"249g"}',
     'EA',1500,2200,'Active',2018,2028,36,7,'0.55 lbs','6.15 x 2.97 x 0.57 in','USB-C, nano-SIM',null,'TC78-G','rugged,touch,cellular,4g,field,android'],
    ['TC78-G','TC78 Touch Computer','Zebra Technologies','Mobile','Touch Computer','Handheld','Next-gen touch computer with 5G. Replaces TC77. Wi-Fi 6E, improved scanning.',
     '{"os":"Android 13","display":"6.0in FHD+","scanner":"SE55-LR","cpu":"Qualcomm QCM6490","ram":"6GB","storage":"128GB","battery":"4400mAh","ip_rating":"IP68","drop":"6ft/1.8m","5g":"Sub-6 5G","wifi":"Wi-Fi 6E","bluetooth":"5.2","weight":"258g"}',
     'EA',1800,2600,'Active',2023,2033,36,10,'0.57 lbs','6.42 x 3.02 x 0.55 in','USB-C, nano-SIM/eSIM','TC77-G',null,'rugged,touch,5g,field,android'],
    // Zebra — Printers
    ['ZT411-4','ZT411 Industrial Printer 4-inch','Zebra Technologies','Printer','Label Printer','Industrial','Mid-range industrial thermal printer. Replaces ZT410. 203/300 DPI options.',
     '{"print_width":"4.09in","resolution":"203/300 DPI","speed":"14 ips (203), 12 ips (300)","connectivity":"USB,Serial,Ethernet,Bluetooth,Wi-Fi","media_capacity":"8in OD roll","ribbon_capacity":"1476ft (450m)","display":"4.3in color touchscreen","memory":"512MB RAM, 2GB Flash"}',
     'EA',2200,3200,'Active',2020,2030,24,7,'45 lbs','15.5 x 10.3 x 13.4 in','100-240V AC','ZT410',null,'printer,label,industrial,thermal,barcode'],
    ['ZQ521-G','ZQ521 Mobile Printer','Zebra Technologies','Printer','Mobile Printer','Rugged','Rugged mobile receipt/label printer. 4.4-inch print width. Military-grade.',
     '{"print_width":"4.4in","resolution":"203 DPI","speed":"5 ips","connectivity":"USB-C,Bluetooth 5.0,Wi-Fi,WLAN","battery":"PowerPrecision+ 3250mAh","ip_rating":"IP54","drop":"6.6ft/2m tumble","temp":"-20°C to 50°C","media_width":"up to 113mm","weight":"830g"}',
     'EA',900,1400,'Active',2020,2030,24,7,'1.83 lbs','7.2 x 6.1 x 3.3 in','USB-C charging, 12/24V vehicle adapter',null,null,'printer,mobile,rugged,receipt,label'],
    // Zebra — Accessories
    ['BTRY-MC93-STN-10','MC9300/9400 Standard Battery','Zebra Technologies','Accessory','Battery','Consumable','Standard 7000 mAh PowerPrecision+ battery for MC93xx/MC94xx series.',
     '{"capacity":"7000mAh","voltage":"3.7V","type":"Li-Ion PowerPrecision+","cycles":"1000+","compatible":"MC9300,MC9400"}',
     'EA',90,130,'Active',2019,2029,12,3,'5.6 oz',null,null,null,null,'battery,mc9300,mc9400,accessory'],
    ['CRD-MC93-2SUCHG','MC9300/9400 2-Slot Charging Cradle','Zebra Technologies','Accessory','Cradle','Peripheral','2-slot USB charging cradle. Charges terminal + spare battery.',
     '{"slots":2,"charging":"USB-C power","compatible":"MC9300,MC9400","includes":"Power supply"}',
     'EA',280,380,'Active',2019,2029,12,5,null,null,null,null,null,'cradle,charger,mc9300,mc9400,accessory'],
    ['SG-MC9X-HSTRP-01','MC9300/9400 Hand Strap','Zebra Technologies','Accessory','Strap','Consumable','Replacement hand strap for MC93xx/MC94xx rugged scanners.',
     null,'EA',15,25,'Active',2019,2029,6,3,null,null,null,null,null,'strap,mc9300,mc9400,accessory'],

    // ═══════════════ FORTINET — Network Security ═══════════════
    ['FG-60F','FortiGate 60F Next-Gen Firewall','Fortinet','Infrastructure','Firewall','Security Appliance','Compact desktop NGFW. Ideal for branch offices. SD-WAN built-in.',
     '{"throughput_fw":"10 Gbps","throughput_ips":"1.4 Gbps","throughput_vpn":"6.5 Gbps","interfaces":"10x GE RJ45","wifi":"optional via FortiAP","storage":"128GB SSD","sessions":700000,"users":"recommended 15-30","form_factor":"Desktop","utm_throughput":"700 Mbps"}',
     'EA',600,900,'Active',2020,2027,12,5,'2.9 lbs','8.5 x 6.3 x 1.5 in','12V DC, 36W','FG-40F',null,'firewall,ngfw,sd-wan,branch,security'],
    ['FG-100F','FortiGate 100F Next-Gen Firewall','Fortinet','Infrastructure','Firewall','Security Appliance','Mid-range NGFW for campus edge. Hardware SPU accelerated.',
     '{"throughput_fw":"20 Gbps","throughput_ips":"2.6 Gbps","throughput_vpn":"11.5 Gbps","interfaces":"22x GE, 4x SFP","storage":"128GB SSD","sessions":"1.5M","users":"recommended 50-100","form_factor":"1U Rack","utm_throughput":"1 Gbps"}',
     'EA',2800,4000,'Active',2020,2027,12,7,'8.7 lbs','17.3 x 10.0 x 1.7 in','100-240V AC, 150W',null,null,'firewall,ngfw,campus,security,rack'],
    ['FG-200F','FortiGate 200F Next-Gen Firewall','Fortinet','Infrastructure','Firewall','Security Appliance','High-performance NGFW for enterprise core/campus.',
     '{"throughput_fw":"27 Gbps","throughput_ips":"4.2 Gbps","throughput_vpn":"13 Gbps","interfaces":"16x GE, 8x SFP+, 4x 10G SFP+","storage":"240GB SSD","sessions":"3M","users":"recommended 100-300","form_factor":"1U Rack","utm_throughput":"3 Gbps"}',
     'EA',6500,9500,'Active',2021,2028,12,10,'10.6 lbs','17.3 x 16.5 x 1.7 in','100-240V AC, dual PSU optional',null,null,'firewall,ngfw,enterprise,core,security'],
    ['FS-248E-FPOE','FortiSwitch 248E-FPOE','Fortinet','Infrastructure','Switch','Network Switch','48-port GE managed PoE+ switch with 4x 10G SFP+ uplinks. FortiLink integration.',
     '{"ports":"48x GE PoE+, 4x 10G SFP+","poe_budget":"740W","management":"FortiLink, CLI, Web GUI","switching":"176 Gbps","forwarding":"131 Mpps","mac_table":"16K","vlan":4094,"form_factor":"1U Rack"}',
     'EA',3200,4500,'Active',2021,2028,12,10,'12.1 lbs','17.3 x 10.8 x 1.7 in','100-240V AC',null,null,'switch,poe,managed,48-port,fortilink'],
    ['FS-124E-FPOE','FortiSwitch 124E-FPOE','Fortinet','Infrastructure','Switch','Network Switch','24-port GE managed PoE+ switch with 4x GE SFP uplinks.',
     '{"ports":"24x GE PoE+, 4x GE SFP","poe_budget":"370W","management":"FortiLink, CLI, Web GUI","switching":"56 Gbps","forwarding":"83 Mpps","mac_table":"16K","form_factor":"1U Rack"}',
     'EA',1600,2400,'Active',2021,2028,12,7,'7.3 lbs','17.3 x 8.9 x 1.7 in','100-240V AC',null,null,'switch,poe,managed,24-port,fortilink'],
    ['FAP-231F','FortiAP 231F Indoor Access Point','Fortinet','Infrastructure','Access Point','Wireless','Wi-Fi 6 indoor access point. FortiLink managed. Dual-radio.',
     '{"standard":"Wi-Fi 6 (802.11ax)","bands":"Dual-band 2.4/5 GHz","radios":2,"mimo":"2x2 MU-MIMO","max_throughput":"1.73 Gbps","poe":"802.3at PoE+","management":"FortiLink/FortiGate","antenna":"Internal","form_factor":"Ceiling mount"}',
     'EA',400,600,'Active',2020,2027,12,5,'1.7 lbs','8.7 x 8.7 x 1.4 in','802.3at PoE+',null,null,'wireless,ap,wifi6,indoor,fortilink'],
    ['FAP-431F','FortiAP 431F Outdoor Access Point','Fortinet','Infrastructure','Access Point','Wireless','Wi-Fi 6 outdoor access point. IP67 rated. FortiLink managed.',
     '{"standard":"Wi-Fi 6 (802.11ax)","bands":"Tri-band 2.4/5 GHz","radios":3,"mimo":"4x4 MU-MIMO","max_throughput":"4.8 Gbps","poe":"802.3bt PoE++","management":"FortiLink/FortiGate","antenna":"Internal high-gain","ip_rating":"IP67","form_factor":"Pole/Wall mount"}',
     'EA',900,1400,'Active',2021,2028,12,7,'6.2 lbs','10.2 x 10.2 x 3.1 in','802.3bt PoE++',null,null,'wireless,ap,wifi6,outdoor,fortilink,ip67'],
    ['FC-UTM-BDL','FortiGuard UTM Bundle License','Fortinet','Software','Security License','Subscription','Unified Threat Management bundle: AV, IPS, Web Filter, AntiSpam, FortiSandbox Cloud, App Control.',
     '{"includes":"FortiGuard AV, IPS, Web Filter, AntiSpam, FortiSandbox Cloud, App Control, Industrial Security","term":"1/3/5 year"}',
     'EA',0,0,'Active',2020,null,0,1,null,null,null,null,null,'license,utm,fortiguard,security,subscription'],

    // ═══════════════ DELL — Desktops, Laptops, Servers ═══════════════
    // Desktops
    ['OPTIPLEX-7010-SFF','OptiPlex 7010 Small Form Factor','Dell Technologies','Hardware','Desktop','Desktop PC','Business mainstream SFF desktop. 13th Gen Intel Core. Ideal for office/production office.',
     '{"cpu":"Intel Core i5-13500/i7-13700","ram":"8-64GB DDR5","storage":"256GB-2TB NVMe SSD","graphics":"Intel UHD 770","display_ports":"DP 1.4a, HDMI 2.0","usb":"6x USB-A, 2x USB-C","ethernet":"1x GbE RJ45","expansion":"1x PCIe x16, 1x PCIe x1, 1x M.2","os":"Windows 11 Pro","vpro":"Intel vPro optional","tpm":"TPM 2.0"}',
     'EA',800,1400,'Active',2023,2030,36,5,'12.5 lbs','11.42 x 3.65 x 11.48 in','200W PSU',null,null,'desktop,sff,business,vpro,office'],
    ['OPTIPLEX-5014-SFF','OptiPlex 5014 Small Form Factor','Dell Technologies','Hardware','Desktop','Desktop PC','Cost-effective SFF desktop. 13th Gen Intel Core. Budget office workstation.',
     '{"cpu":"Intel Core i3-13100/i5-13500","ram":"8-32GB DDR5","storage":"256GB-1TB SSD","graphics":"Intel UHD 730/770","display_ports":"DP, HDMI","usb":"4x USB-A, 1x USB-C","ethernet":"1x GbE RJ45","os":"Windows 11 Pro","tpm":"TPM 2.0"}',
     'EA',600,1000,'Active',2023,2030,36,5,'12.0 lbs','11.42 x 3.65 x 11.48 in','180W PSU',null,null,'desktop,sff,budget,office'],
    // Laptops
    ['LATITUDE-5540','Latitude 5540 Laptop','Dell Technologies','Hardware','Laptop','Laptop','15.6" mainstream business laptop. Intel 13th Gen. Ideal for mobile workers and management.',
     '{"cpu":"Intel Core i5-1345U/i7-1365U","ram":"8-32GB DDR5","storage":"256GB-1TB NVMe SSD","display":"15.6in FHD IPS","graphics":"Intel Iris Xe","battery":"54Wh (up to 10hr)","ports":"2x USB-C TB4, 2x USB-A, HDMI 2.0, RJ45, 3.5mm","wifi":"Wi-Fi 6E","bluetooth":"5.3","webcam":"FHD IR","os":"Windows 11 Pro","tpm":"TPM 2.0","weight":"1.66 kg"}',
     'EA',1000,1600,'Active',2023,2030,36,5,'3.66 lbs','14.01 x 9.21 x 0.76 in','65W USB-C charger',null,null,'laptop,business,15inch,thunderbolt'],
    ['LATITUDE-7450','Latitude 7450 Ultrabook','Dell Technologies','Hardware','Laptop','Laptop','14" ultra-premium business ultrabook. Intel Core Ultra. For executives and engineers.',
     '{"cpu":"Intel Core Ultra 5/7","ram":"16-32GB LPDDR5x","storage":"256GB-1TB NVMe SSD","display":"14in FHD+ IPS or OLED","graphics":"Intel Arc","battery":"54Wh (up to 13hr)","ports":"2x TB4, 1x USB-A, HDMI 2.1","wifi":"Wi-Fi 7","bluetooth":"5.4","webcam":"FHD + IR","os":"Windows 11 Pro","tpm":"TPM 2.0","weight":"1.42 kg"}',
     'EA',1400,2200,'Active',2024,2031,36,7,'3.13 lbs','12.46 x 8.75 x 0.69 in','65W USB-C charger',null,null,'laptop,ultrabook,premium,14inch,thunderbolt'],
    // Monitors
    ['P2425H','24" Professional Monitor P2425H','Dell Technologies','Hardware','Monitor','Display','24" FHD IPS monitor. USB-C connectivity, adjustable stand. ComfortView Plus.',
     '{"size":"23.8in","resolution":"1920x1080 FHD","panel":"IPS","refresh":"60Hz","ports":"1x HDMI, 1x DP, 1x USB-C (65W PD), USB hub","stand":"Height, tilt, swivel, pivot","vesa":"100x100mm","color":"99% sRGB","response":"5ms"}',
     'EA',220,320,'Active',2024,2031,36,3,'14.1 lbs','21.2 x 7.7 x 18.6 in','Internal PSU',null,null,'monitor,24inch,usb-c,ips,business'],
    ['U2724D','27" UltraSharp 4K Monitor U2724D','Dell Technologies','Hardware','Monitor','Display','27" 4K UltraSharp IPS Black monitor. 120Hz, USB-C hub. For CAD/engineering.',
     '{"size":"27in","resolution":"3840x2160 4K","panel":"IPS Black","refresh":"120Hz","ports":"1x HDMI, 1x DP, 2x USB-C (90W PD), RJ45, 5x USB-A","stand":"Height, tilt, swivel, pivot","vesa":"100x100mm","color":"98% DCI-P3","response":"5ms","hdr":"VESA DisplayHDR 600"}',
     'EA',550,700,'Active',2024,2031,36,5,'22.7 lbs','24.2 x 8.1 x 21.5 in','Internal PSU',null,null,'monitor,27inch,4k,usb-c,ultrasharp,hub'],
    // Servers
    ['POWEREDGE-R760','PowerEdge R760 2U Rack Server','Dell Technologies','Infrastructure','Server','Server','Dual-socket 2U rack server. 4th/5th Gen Intel Xeon Scalable. For VM hosts and database.',
     '{"cpu":"2x Intel Xeon Scalable 4th/5th Gen","ram":"up to 4TB DDR5 (32 DIMM slots)","storage":"up to 24x 2.5in SAS/SATA/NVMe","raid":"PERC H965i","network":"2x 1GbE + OCP 3.0","pcie":"up to 10x PCIe 5.0 slots","management":"iDRAC9 Enterprise","power":"dual 1400W/2400W PSU","tpm":"TPM 2.0"}',
     'EA',5000,25000,'Active',2023,2030,36,14,'54 lbs','3.42 x 17.36 x 27.34 in','100-240V AC, dual redundant PSU',null,null,'server,2u,rack,xeon,vmware,database'],
    ['POWEREDGE-R660','PowerEdge R660 1U Rack Server','Dell Technologies','Infrastructure','Server','Server','Dual-socket 1U rack server. Dense compute for rack-constrained environments.',
     '{"cpu":"2x Intel Xeon Scalable 4th/5th Gen","ram":"up to 2TB DDR5 (16 DIMM slots)","storage":"up to 10x 2.5in SAS/SATA/NVMe","raid":"PERC H965i","network":"2x 1GbE + OCP 3.0","pcie":"up to 3x PCIe 5.0 slots","management":"iDRAC9 Enterprise","power":"dual 1100W/1400W PSU","tpm":"TPM 2.0"}',
     'EA',4000,18000,'Active',2023,2030,36,14,'39 lbs','1.72 x 17.36 x 27.34 in','100-240V AC, dual redundant PSU',null,null,'server,1u,rack,xeon,dense'],
    // Dell — Docking
    ['WD22TB4','Thunderbolt 4 Dock WD22TB4','Dell Technologies','Accessory','Dock','Peripheral','Thunderbolt 4 docking station. Triple 4K display. 130W charging.',
     '{"connectivity":"Thunderbolt 4 (upstream)","displays":"3x 4K @ 60Hz","ports":"1x TB4, 1x USB-C, 3x USB-A 3.2, 1x USB-A 2.0, 1x HDMI, 2x DP 1.4, 1x RJ45 GbE, 1x 3.5mm","charging":"130W USB-C PD","cable":"0.8m TB4"}',
     'EA',280,400,'Active',2022,2029,12,3,'1.73 lbs','8.11 x 3.15 x 1.14 in','210W AC adapter included',null,null,'dock,thunderbolt4,triple-display,charger'],

    // ═══════════════ SAMSUNG — Tablets & Mobile ═══════════════
    ['SM-X210','Galaxy Tab A9+ 11" Wi-Fi','Samsung','Mobile','Tablet','Tablet','11" business tablet. Ideal for kiosk, viewing schematics on the floor.',
     '{"os":"Android 14/One UI 6","display":"11.0in TFT LCD 1920x1200","cpu":"Qualcomm SM6375","ram":"4/8GB","storage":"64/128GB + microSD","battery":"7040mAh","camera":"8MP rear, 5MP front","connectivity":"Wi-Fi 5, Bluetooth 5.3","weight":"480g"}',
     'EA',200,300,'Active',2023,2030,12,3,'1.06 lbs','10.39 x 6.55 x 0.28 in','USB-C 15W charging',null,null,'tablet,android,11inch,samsung'],
    ['SM-X810','Galaxy Tab S9+ 12.4" Wi-Fi','Samsung','Mobile','Tablet','Tablet','12.4" premium tablet with S Pen. For engineering drawings and schematics review.',
     '{"os":"Android 14/One UI 6","display":"12.4in Dynamic AMOLED 2X 2800x1752 120Hz","cpu":"Snapdragon 8 Gen 2","ram":"12GB","storage":"256/512GB","battery":"10090mAh","camera":"13+8MP rear, 12MP front","ip_rating":"IP68","s_pen":"included","connectivity":"Wi-Fi 6E, Bluetooth 5.3","weight":"586g","dex":"Samsung DeX support"}',
     'EA',900,1200,'Active',2023,2030,12,5,'1.29 lbs','11.43 x 7.28 x 0.23 in','USB-C 45W fast charging',null,null,'tablet,android,12inch,samsung,premium,s-pen'],
    ['SM-X710','Galaxy Tab S9 FE 10.9" Wi-Fi','Samsung','Mobile','Tablet','Tablet','10.9" mid-range tablet with S Pen and IP68 water resistance. Ideal for maintenance technicians.',
     '{"os":"Android 14","display":"10.9in TFT LCD 2304x1440","cpu":"Samsung Exynos 1380","ram":"6/8GB","storage":"128/256GB","battery":"8000mAh","camera":"8MP rear, 12MP front","ip_rating":"IP68","s_pen":"included","connectivity":"Wi-Fi 6, Bluetooth 5.3","weight":"523g"}',
     'EA',400,550,'Active',2023,2030,12,3,'1.15 lbs','10.01 x 6.50 x 0.26 in','USB-C 15W charging',null,null,'tablet,android,10inch,samsung,s-pen,ip68'],
    // Samsung — Rugged Tablets
    ['SM-T736B','Galaxy Tab Active4 Pro','Samsung','Mobile','Rugged Tablet','Tablet','10.1" rugged enterprise tablet. MIL-STD-810H. Hot-swappable battery. Glove/wet-touch mode.',
     '{"os":"Android 13/14","display":"10.1in 1920x1200","cpu":"Qualcomm SD778G","ram":"4/6GB","storage":"64/128GB + microSD","battery":"7600mAh hot-swap","camera":"13MP rear, 8MP front","ip_rating":"IP68","mil_spec":"MIL-STD-810H","drop":"5ft/1.5m","s_pen":"included","barcode":"integrated scanner optional","connectivity":"Wi-Fi 6, 5G optional, Bluetooth 5.2","weight":"674g","knox":"Samsung Knox"}',
     'EA',700,1000,'Active',2022,2029,24,7,'1.49 lbs','9.54 x 6.32 x 0.40 in','USB-C, POGO pin dock, hot-swap battery',null,null,'tablet,rugged,mil-spec,hot-swap,enterprise,knox'],
];

const insProdTx = db.transaction(() => {
    for (const p of products) insProd.run(...p);
});
insProdTx();
console.log(`   ✅ ${products.length} products seeded`);

// ── Accessories ────────────────────────────────────────────────────────
const insAcc = db.prepare(`INSERT OR REPLACE INTO ITMasterAccessories (ParentPartNumber, AccessoryPartNumber, AccessoryName, AccessoryType, Required, Notes) VALUES (?,?,?,?,?,?)`);

const accessories = [
    ['MC9300-G','BTRY-MC93-STN-10','Standard Battery 7000mAh','Battery',1,'Required — ships without battery'],
    ['MC9300-G','CRD-MC93-2SUCHG','2-Slot Charging Cradle','Cradle',0,'Recommended for fleet charging'],
    ['MC9300-G','SG-MC9X-HSTRP-01','Replacement Hand Strap','Strap',0,'Consumable — order annually'],
    ['MC9400-G','BTRY-MC93-STN-10','Standard Battery 7000mAh (backward compatible)','Battery',1,'Same battery as MC9300'],
    ['MC9400-G','CRD-MC93-2SUCHG','2-Slot Charging Cradle','Cradle',0,'Backward compatible with MC9300 cradles'],
    ['ZT411-4','P1058930-009','Printhead 203 DPI ZT411','Printhead',0,'Replace every 500,000 linear inches'],
    ['ZT411-4','P1058930-010','Printhead 300 DPI ZT411','Printhead',0,'Replace every 300,000 linear inches'],
    ['ZQ521-G','BTRY-MPP-68MA1-01','ZQ510/520/521 Battery','Battery',1,'PowerPrecision+ Li-Ion'],
    ['FG-60F','FC-UTM-BDL','FortiGuard UTM Bundle License','License',0,'Annual subscription — AV, IPS, Web Filter'],
    ['FG-100F','FC-UTM-BDL','FortiGuard UTM Bundle License','License',0,'Annual subscription — required for full NGFW'],
    ['FG-200F','FC-UTM-BDL','FortiGuard UTM Bundle License','License',0,'Annual subscription — required for full NGFW'],
];

const insAccTx = db.transaction(() => {
    for (const a of accessories) insAcc.run(...a);
});
insAccTx();
console.log(`   ✅ ${accessories.length} accessories seeded`);

// ── Master Vendors ─────────────────────────────────────────────────────
const insVendor = db.prepare(`INSERT OR REPLACE INTO ITMasterVendors VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const vendors = [
    ['ZEBRA','Zebra Technologies','zebra.com','800-423-0442','877-275-9327','Authorized Partner','["Rugged Scanners","Mobile Computers","Label Printers","Supplies","Accessories"]','National','Standard 36mo on devices, 24mo on printers','Zebra OneCare: 3-day repair turnaround',null,null,null],
    ['FORTINET','Fortinet Inc.','fortinet.com','408-235-7700','866-868-3678','Platinum Partner','["Firewalls","Switches","Access Points","Security Licenses","FortiGuard"]','National','Standard 12mo hardware, subscription-based software','FortiCare Premium: 1hr Sev1, 4hr Sev2',null,null,null],
    ['DELL','Dell Technologies','dell.com','800-289-3355','800-456-3355','Premier Partner','["Desktops","Laptops","Servers","Monitors","Docking","Storage"]','National','Standard 36mo ProSupport, extendable to 5yr','ProSupport Plus: NBD on-site, 24/7 phone',null,null,null],
    ['SAMSUNG','Samsung Electronics','samsung.com','800-726-7864','800-726-7864','Enterprise Partner','["Tablets","Rugged Tablets","Mobile Devices","Displays","Knox"]','National','Standard 12-24mo, Knox enterprise support','Samsung Enterprise: Knox support 4hr response',null,null,null],
    ['SOTI','SOTI Inc.','soti.net','519-650-3555','888-768-4462','Enterprise Partner','["MDM Platform","MobiControl","SOTI XSight","SOTI Central"]','National','Subscription-based, tied to device count','Enterprise: 4hr P1, 8hr P2',null,null,null],
    ['PCS_MOBILE','PCS Mobile','pcsmobile.com','888-727-5543','888-727-5543','Authorized Repair','["Zebra Repairs","Scanner Staging","Warranty Claims","Parts"]','National','Repair warranty 90 days','48hr repair turnaround',null,null,null],
];

const insVendorTx = db.transaction(() => {
    for (const v of vendors) insVendor.run(...v);
});
insVendorTx();
console.log(`   ✅ ${vendors.length} IT vendors seeded`);

// ── Summary ──────────────────────────────────────────────────────────
const counts = {
    products: db.prepare('SELECT COUNT(*) as c FROM ITMasterProducts').get().c,
    accessories: db.prepare('SELECT COUNT(*) as c FROM ITMasterAccessories').get().c,
    vendors: db.prepare('SELECT COUNT(*) as c FROM ITMasterVendors').get().c,
};
console.log(`\n🖥️  IT Master Data Catalog Created!`);
console.log(`   📦 ${counts.products} Products (Zebra, Fortinet, Dell, Samsung)`);
console.log(`   🔗 ${counts.accessories} Accessories/Attachments`);
console.log(`   🏢 ${counts.vendors} Master Vendors`);
console.log(`   📂 ${dbPath}`);

db.close();
