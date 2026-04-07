// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Supply Chain Seed Data
 * ===================================
 * Real dairy industry vendor and inventory item seed data sourced from
 * actual plant monthly ending inventory reports. Populates the supply chain
 * module with production-ready vendor records and item categories on first run.
 *
 * KEY FEATURES:
 *   - VENDORS array: 30+ real dairy industry suppliers with contact info,
 *     lead times, categories, and specialty product descriptions
 *   - ITEMS array: dairy-specific supply items keyed to vendor and category
 *   - Categories: Dairy Ingredients, Chemicals, Packaging, Maintenance, Utilities
 *   - Lead times: accurate vendor lead times for PO planning
 *   - Brand-neutral: plant-specific brand prefixes omitted for reusability
 *
 * USAGE:
 *   Called by server/migrator.js during initial plant setup or reset.
 *   Data is inserted only if the vendor/item does not already exist (upsert-safe).
 *
 * ENDPOINTS: (none — this is a data module, not a route file)
 *   Consumed by: POST /api/plant-setup/seed-supply-chain
 */

// supply_chain_seed.js — Real dairy industry vendor & item seed data
// Sourced from actual dairy plant monthly ending inventory reports.
// Note: Brand-specific plant prefixes omitted for neutral, reusable data.

const VENDORS = [
    // Already in base seed — kept for reference, skipped if exist
    ['Tate & Lyle',             'Dairy Ingredients', 'Sales Desk',     '1-800-526-5728', 'dairysales@tatelyle.com',      'tateandlyle.com',       7,  'Sugar, HFCS, Krystar fructose, specialty sweeteners'],
    ['Ecolab',                  'Chemicals',         'Service Rep',    '1-800-352-5326', 'foodsafety@ecolab.com',        'ecolab.com',            5,  'CIP chemicals, sanitizers, Conquest, Excelerate, Klem-Solv'],
    ['Chr. Hansen',             'Dairy Ingredients', 'Dairy Team',     '1-414-607-5700', 'dairy@chr-hansen.com',         'chr-hansen.com',        10, 'Cultures, enzymes, probiotics'],
    ['Kerry Group',             'Dairy Ingredients', 'Kerry Dairy',    '1-800-000-0000', 'dairy@kerry.com',              'kerry.com',             7,  'Buttermilk powder, whey, stabilizers'],
    ['Hawkins Inc.',            'Chemicals',         'Chemical Sales', '1-612-331-6910', 'food@hawkinsinc.com',          'hawkinsinc.com',        5,  'Phosphoric acid, caustic soda'],
    ['Sealed Air / Cryovac',    'Packaging',         'Packaging Rep',  '1-800-498-2880', 'foodsolutions@sealedair.com',  'sealedair.com',         14, 'Vacuum pouches, shrink wrap'],
    ['DS Smith',                'Packaging',         'Carton Sales',   '1-800-832-8302', 'dairy@dssmith.com',            'dssmith.com',           10, 'Gable top cartons, shipping cases'],
    ['LyondellBasell',          'Packaging',         'Resin Sales',    '1-713-309-7200', 'plastics@lyb.com',             'lyb.com',               21, 'HDPE & PP resin for blow molding'],
    ['Grainger',                'Consumables',       'Account Mgr',    '1-800-472-4643', 'dairy@grainger.com',           'grainger.com',          2,  'Bulbs, gloves, hairnets, consumables'],
    ['Balchem / Albion',        'Dairy Ingredients', 'Human Nutrition','1-845-326-5600', 'nutrition@balchem.com',        'balchem.com',           10, 'Vitamins A&D, mineral premix'],
    ['Ventura Foods',           'Dairy Ingredients', 'Butter Sales',   '1-302-421-1800', 'dairy@venturafoods.com',       'venturafoods.com',      5,  'AMF, cultured butter blend'],
    ['International Flavors',   'Dairy Ingredients', 'Dairy R&D',      '1-212-765-5500', 'dairy@iff.com',                'iff.com',               14, 'Vanilla, chocolate, strawberry flavors'],
    // New vendors from real inventory sheets
    ['Crest Foods',             'Dairy Ingredients', 'Dairy Sales',    '1-800-000-0000', 'sales@crestfoods.com',         'crestfoods.com',        7,  'Skim powder, buttermilk stabilizer, whipping cream stabilizer'],
    ['Dairypak / Evergreen',    'Packaging',         'Carton Sales',   '1-800-000-0000', 'orders@dairypak.com',          'dairypak.com',          10, 'Gable top cartons all fat levels, slim pak variants'],
    ['Blackhawk',               'Packaging',         'Cap Sales',      '1-800-000-0000', 'sales@blackhawkcaps.com',      'blackhawk.com',         7,  'HDPE caps: Red=Homo, Blue=2%, Purple=1%, Pink=Skim, Brown=FF'],
    ['KDV Label',               'Packaging',         'Label Sales',    '1-800-000-0000', 'orders@kdvlabel.com',          'kdvlabel.com',          10, 'Gallon labels with UPC, half-pint labels by fat % and customer'],
    ['INT\'L PAPER',            'Packaging',         'Box Sales',      '1-800-000-0000', 'packaging@ipaper.com',         'internationalpaper.com',10, 'Gable top carton blanks: gal, qt, 5-gal, 2/5lb, 2x10qt'],
    ['RAPAK',                   'Packaging',         'Bag Sales',      '1-800-000-0000', 'sales@rapak.com',              'rapak.com',             14, '5-Gal dispenser bags 2800/pallet'],
    ['Carter Paper',            'Consumables',       'Rep',            '1-800-000-0000', 'orders@carterpaper.com',       'carterpaper.com',       3,  'Box tapes, masking tape, sealing tape, tissue, stretch film, paper sacks'],
    ['R.V. Evans',              'Consumables',       'Rep',            '1-800-000-0000', 'orders@rvevans.com',           'rvevans.com',           5,  'Poly strapping, banding supplies'],
    ['Frontier Bag',            'Packaging',         'Rep',            '1-800-000-0000', 'orders@frontierbag.com',       'frontierbag.com',       7,  'Poly bags, reclosable bags, liners'],
    ['Sentry Safety',           'Consumables',       'Rep',            '1-800-000-0000', 'orders@sentrysafety.com',      'sentrysafety.com',      3,  'Hair nets, beard covers, gloves, ear plugs, can liners'],
    ['Nelson Jameson',          'Consumables',       'Rep',            '1-800-826-8302', 'orders@nelsonjameson.com',     'nelsonjameson.com',     5,  'Sanitation brushes, lab supplies, filter discs, Anderson charts'],
    ['Motion Industries',       'Consumables',       'Branch Rep',     '1-800-526-9328', 'dairy@motion.com',             'motionindustries.com',  2,  'FGL lubriplate grease, LED bulbs, bearings, belts'],
    ['MDI',                     'Consumables',       'Rep',            '1-800-000-0000', 'orders@mdi.com',               'mdi.com',               3,  'Mobil SHC 634, DTE Heavy, DTE 24, DTE BB, DTE Light oils'],
    ['Office Pro / Carlisle',   'Consumables',       'Rep',            '1-800-000-0000', 'orders@officepro.com',         'officepro.com',         3,  'Haynes spray lube, CIP lube tubes'],
    ['New Pig Corp',            'Consumables',       'Rep',            '1-800-468-4647', 'orders@newpig.com',            'newpig.com',            3,  'Absorbent mats, socks, hand wipes, spill kits'],
    ['IMS Partners',            'Consumables',       'Rep',            '1-800-000-0000', 'orders@imspartners.com',       'imspartners.com',       5,  'Bottle ink, make-up fluid for coding equipment'],
    ['F&H Equipment',           'Consumables',       'Rep',            '1-800-000-0000', 'orders@fhequip.com',           'fhequip.com',           3,  'Scotchbrite pads, general equipment supplies'],
    ['Cazenovia Salt',          'Dairy Ingredients', 'Salt Sales',     '1-800-000-0000', 'orders@cazenoviasalt.com',     'cazenoviasalt.com',     5,  'Fine salt 50lb bags, water softener salt'],
    ['Garrett-Callahan',        'Chemicals',         'Rep',            '1-800-431-3914', 'dairy@garrettcallahan.com',    'garrettcallahan.com',   5,  'Boiler/cooling water treatment: Formula 1100, 2211, 159, 47, 250, LC'],
    ['Brenntag',                'Chemicals',         'Chemical Sales', '1-800-000-0000', 'food@brenntag.com',            'brenntag.com',          5,  'Sodium hypochlorite, sulfuric acid, chemical distribution'],
    ['Buckeye Products',        'Consumables',       'Rep',            '1-800-000-0000', 'orders@buckeyeproducts.com',   'buckeyeproducts.com',   5,  'Thermal transfer ribbons, thermal labels for coding/dating'],
    ['D.S.I.',                  'Consumables',       'Rep',            '1-800-000-0000', 'orders@dsi.com',               'dsi.com',               5,  'Meter tickets, process documentation supplies'],
    ['J.J. Keller',             'Consumables',       'Rep',            '1-800-327-6868', 'orders@jjkeller.com',          'jjkeller.com',          5,  'Tanker seals, truck seals, DOT/regulatory compliance supplies'],
    ['Carlinville',             'Consumables',       'Rep',            '1-800-000-0000', 'orders@carlinville.com',       'carlinville.com',       5,  'Tanker sanitizing tags'],
    ['Carlvise',                'Consumables',       'Rep',            '1-800-000-0000', 'orders@carlvise.com',          'carlvise.com',          7,  'Bassine buffer brushes with clutch, specialty scrubbing brushes'],
    ['Cleveland Spec',          'Consumables',       'Rep',            '1-800-000-0000', 'orders@clevelandspec.com',     'clevelandspec.com',     5,  'Colored identification tags (Red, Pink, Yellow, Green, Blue, Violet, White, Black)'],
];

// Item seed rows: [ItemCode, Description, Category, SubCategory, vendorName, VendorPartNo, UOM, PackSize, UnitCost, OnHand, MinStock, MaxStock, ReorderPt, StorageArea, HazMat, Notes]
const ITEMS_BY_VENDOR = {
    // ── Crest Foods — Dairy Powders & Stabilizers ──────────────────────────────
    'Crest Foods': [
        ['ING-016', 'Skim Milk Powder 40x50lb',          'Dairy Ingredients', 'Dairy Powders',    'Crest Lac300',   'lbs',  50,   1.55, 2700,  1000, 10000, 2000, 'Dry Storage A', 0, '40 bags x 50lb, Crest Lac300'],
        ['ING-017', 'Buttermilk Stabilizer 40x50lb',     'Dairy Ingredients', 'Stabilizers',      'Crest #659',     'lbs',  50,   2.20, 1700,   500,  8000, 1000, 'Dry Storage A', 0, 'Crest #659, 40x50lb pallet'],
        ['ING-018', 'Whipping Cream Stabilizer 40x50lb', 'Dairy Ingredients', 'Stabilizers',      'Crest #31-D308', 'lbs',  50,   3.10, 1800,   400,  6000,  800, 'Dry Storage B', 0, 'Crest #31-D308'],
    ],
    // ── Tate & Lyle — Sweeteners ───────────────────────────────────────────────
    'Tate & Lyle': [
        ['ING-001', 'Liquid Sugar (Sucrose)',             'Dairy Ingredients', 'Sweeteners',       'T&L-SUGAR-LIQ',  'lbs', 1000,  0.22,11320,  4000, 30000, 6000, 'Liquid Tank Farm',  0, 'Bulk tank delivery, 96% sucrose solution'],
        ['ING-019', 'Choc Powder #7 60x33.5lbs',         'Dairy Ingredients', 'Cocoa & Flavors',  '730707',         'lbs',  33.5, 3.40,10040,  2000, 20000, 4000, 'Dry Storage B', 0, '2000lb/pallet, Dutch process'],
        ['ING-020', 'Choc Powder #8 50x40lbs',           'Dairy Ingredients', 'Cocoa & Flavors',  '706008',         'lbs',  40,   3.75, 0,      500,  8000,  800, 'Dry Storage B', 0, '2000lb/pallet'],
        ['ING-021', 'Krystar Gran Fructose 22.50#/pallet','Dairy Ingredients','Sweeteners',        '45x50lbs',       'lbs',  50,   0.55, 0,      500,  5000, 1000, 'Dry Storage A', 0, '22.50# pallet'],
    ],
    // ── Balchem — Vitamins ──────────────────────────────────────────────────────
    'Balchem / Albion': [
        ['ING-005', 'Vitamin D3L (4x1 GAL/CS)',          'Dairy Ingredients', 'Vitamins',         '500124',         'gal',  1,  52.00,    9,     4,    80,   10, 'Ingredient Room', 0, '4x1 gal/cs, cold storage, D3 liquid'],
        ['ING-006', 'Vitamin A-D (4x1 GAL/CS)',          'Dairy Ingredients', 'Vitamins',         '500282',         'gal',  1,  48.00,   19,     4,    80,   10, 'Ingredient Room', 0, '4x1 gal/cs, cold storage'],
    ],
    // ── Cazenovia Salt ─────────────────────────────────────────────────────────
    'Cazenovia Salt': [
        ['ING-022', 'Fine Salt 50lb Bags',               'Dairy Ingredients', 'Salt',             'FINE-50',        'lbs',  50,   0.18,   51,    18,   500,   30, 'Dry Storage A', 0, '50lb bags'],
        ['ING-023', 'Water Softener Salt 50# Bags',      'Dairy Ingredients', 'Salt',             '2450#/pallet',   'lbs',  50,   0.14,  106,   112,   800,   50, 'Dry Storage A', 0, '50# bags, 2450lb pallet'],
    ],
    // ── Dairypak / Evergreen — Cartons ─────────────────────────────────────────
    'Dairypak / Evergreen': [
        ['PKG-011', 'Homo 1/2 Pt Gable Top',           'Packaging', 'Cartons', '',  'each', 500, 0.115, 76000, 10000,250000,30000, 'Packaging Warehouse', 0, 'Plain & slim pak variants'],
        ['PKG-012', '2% 1/2 Pt Gable Top',             'Packaging', 'Cartons', '',  'each', 500, 0.115,163000, 10000,400000,50000, 'Packaging Warehouse', 0, ''],
        ['PKG-013', '1% 1/2 Pt Gable Top',             'Packaging', 'Cartons', '',  'each', 500, 0.115,105000, 10000,300000,40000, 'Packaging Warehouse', 0, ''],
        ['PKG-014', 'Skim 1/2 Pt Gable Top',           'Packaging', 'Cartons', '',  'each', 500, 0.115,138000,  8000,250000,30000, 'Packaging Warehouse', 0, ''],
        ['PKG-015', 'Buttermilk Qt Gable Top',         'Packaging', 'Cartons', '',  'each', 500, 0.145, 37500,  5000,100000,15000, 'Packaging Warehouse', 0, ''],
        ['PKG-016', '2% Chocolate 1/2 Pt',             'Packaging', 'Cartons', '',  'each', 500, 0.125,122000, 10000,300000,40000, 'Packaging Warehouse', 0, ''],
        ['PKG-017', '36% Whipping Cream Qt Fresh',     'Packaging', 'Cartons', '',  'each', 500, 0.155,176400,  8000,200000,20000, 'Packaging Warehouse', 0, ''],
        ['PKG-018', '40% Whipping Cream Qt',           'Packaging', 'Cartons', '',  'each', 500, 0.155, 98550,  8000,200000,20000, 'Packaging Warehouse', 0, ''],
    ],
    // ── Blackhawk — Caps ───────────────────────────────────────────────────────
    'Blackhawk': [
        ['PKG-019', 'Red Homo Caps',    'Packaging', 'Caps & Closures', '1D504771383', 'each',5000,0.028,218400,20000,600000,80000,'Packaging Warehouse',0,'Red = Homo whole milk'],
        ['PKG-020', 'Blue 2% Caps',     'Packaging', 'Caps & Closures', '1D505471384', 'each',5000,0.028,292800,30000,700000,90000,'Packaging Warehouse',0,'Blue = 2% reduced fat'],
        ['PKG-021', 'Purple 1% Caps',   'Packaging', 'Caps & Closures', '1D505573742', 'each',5000,0.028,114000,15000,400000,50000,'Packaging Warehouse',0,'Purple = 1% low fat'],
        ['PKG-022', 'Pink Skim Caps',   'Packaging', 'Caps & Closures', '1D506173755', 'each',5000,0.028,148800,15000,400000,50000,'Packaging Warehouse',0,'Pink = Skim'],
        ['PKG-023', 'Plain Red Homo Caps',  'Packaging','Caps & Closures','1D50475',    'each',5000,0.025,286400,25000,600000,80000,'Packaging Warehouse',0,'Unprinted, Homo'],
        ['PKG-024', 'Plain Blue 2% Caps',   'Packaging','Caps & Closures','1D50545',    'each',5000,0.025,286400,25000,600000,80000,'Packaging Warehouse',0,'Unprinted, 2%'],
        ['PKG-025', 'Plain Purple 1% Caps', 'Packaging','Caps & Closures','1D50555',    'each',5000,0.025,115200,10000,400000,50000,'Packaging Warehouse',0,'Unprinted, 1%'],
        ['PKG-026', 'Plain Pink Skim Caps', 'Packaging','Caps & Closures','1D50615',    'each',5000,0.025, 89200,10000,300000,40000,'Packaging Warehouse',0,'Unprinted, Skim'],
        ['PKG-027', 'Plain Green 1% Caps',  'Packaging','Caps & Closures','1D50365',    'each',5000,0.025, 67300,10000,200000,30000,'Packaging Warehouse',0,''],
    ],
    // ── KDV Label — Gallon Labels ──────────────────────────────────────────────
    'KDV Label': [
        ['PKG-028', 'Homo Gallon Labels Front',      'Packaging','Labels','',  'each',1000,0.042,181000,20000,500000,60000,'Packaging Warehouse',0,'With UPC'],
        ['PKG-029', 'Homo Gallon Labels Back',       'Packaging','Labels','',  'each',1000,0.042,140000,15000,400000,50000,'Packaging Warehouse',0,''],
        ['PKG-030', '2% Gallon Labels Front',        'Packaging','Labels','',  'each',1000,0.042,276000,25000,600000,70000,'Packaging Warehouse',0,''],
        ['PKG-031', '2% Gallon Labels Back',         'Packaging','Labels','',  'each',1000,0.042,224000,20000,500000,60000,'Packaging Warehouse',0,''],
        ['PKG-032', '1% Gallon Labels Front',        'Packaging','Labels','',  'each',1000,0.042, 52000,10000,200000,30000,'Packaging Warehouse',0,''],
        ['PKG-033', 'Skim Labels Front',             'Packaging','Labels','',  'each',1000,0.042, 55000,10000,200000,30000,'Packaging Warehouse',0,''],
        ['PKG-034', 'Homo HGL Labels',               'Packaging','Labels','',  'each',1000,0.042, 48000, 8000,150000,20000,'Packaging Warehouse',0,'Half-gallon'],
        ['PKG-035', '2% HGL Labels',                 'Packaging','Labels','',  'each',1000,0.042, 60000, 8000,150000,20000,'Packaging Warehouse',0,'Half-gallon'],
        ['PKG-036', 'FF (Fat Free) Gallon Labels',   'Packaging','Labels','',  'each',1000,0.042, 24000, 5000,100000,15000,'Packaging Warehouse',0,''],
        ['PKG-037', '2% Choc Gallon Labels',         'Packaging','Labels','',  'each',1000,0.042, 12000, 3000, 60000, 8000,'Packaging Warehouse',0,''],
    ],
    // ── INT'L PAPER — Blank Carton Stock ──────────────────────────────────────
    "INT'L PAPER": [
        ['PKG-038', '1-Gal Carton Blanks',      'Packaging','Cartons','', 'each',1000,0.22,  0, 2000, 20000, 4000,'Packaging Warehouse',0,'Unprinted blanks'],
        ['PKG-039', '8-1Qt Carton Blanks',      'Packaging','Cartons','', 'each',1000,0.18,  0, 1500, 15000, 3000,'Packaging Warehouse',0,''],
        ['PKG-040', '1-5Gal Carton Blanks',     'Packaging','Cartons','', 'each', 500,0.65,1200,  300,  5000,  600,'Packaging Warehouse',0,''],
        ['PKG-041', '2/5lb Carton Blanks',      'Packaging','Cartons','', 'each',1000,0.14, 750,  200,  5000,  500,'Packaging Warehouse',0,''],
        ['PKG-042', '2x10Qt Carton Blanks',     'Packaging','Cartons','', 'each', 500,0.28,3500,  500,  8000, 1000,'Packaging Warehouse',0,''],
    ],
    // ── RAPAK — Bag-in-Box ─────────────────────────────────────────────────────
    'RAPAK': [
        ['PKG-043', '5-Gal Dispenser Bag 2800/Pallet', 'Packaging','Film & Wrap','8S11-07','each',2800,0.38,18000,3000,40000,8000,'Packaging Warehouse',0,'Order 33,600 = 17 pallets'],
    ],
    // ── Ecolab — CIP & Sanitation Chemicals ────────────────────────────────────
    'Ecolab': [
        ['CHM-001', 'Conquest CIP Detergent',        'Chemicals','CIP Cleaners', 'ECO-CONQUEST',  'gal',  55, 8.20,  500,  200, 2000,  400,'Chemical Room',1,'55-gal drum, alkaline chlorinated'],
        ['CHM-011', 'Excelerate CIP Detergent',      'Chemicals','CIP Cleaners', 'ECO-EXCEL',     'gal',  55, 9.10,  500,  200, 2000,  400,'Chemical Room',1,'55-gal drum'],
        ['CHM-012', 'Enforce CIP Detergent',         'Chemicals','CIP Cleaners', 'ECO-ENFORCE',   'gal',  55, 8.50,  165,  100, 1000,  200,'Chemical Room',1,'55-gal drum'],
        ['CHM-013', 'Mikron Sanitizer',              'Chemicals','Sanitizers',   'ECO-MIKRON',    'gal',  55, 7.80,  165,  100, 1000,  200,'Chemical Room',1,'55-gal drum, iodine-based'],
        ['CHM-014', 'Eco Care 360',                  'Chemicals','Facility Clean','ECO-360',       'gal',   5,14.00,    0,   10,  200,   20,'Chemical Room',1,'5-gal pail'],
        ['CHM-015', 'Soil Off Detergent',            'Chemicals','CIP Cleaners', 'ECO-SOILOFF',   'gal',  55, 7.20,    0,   50,  500,  100,'Chemical Room',1,'55-gal drum'],
        ['CHM-016', 'Mandate Plus',                  'Chemicals','CIP Cleaners', 'ECO-MANDATE',   'gal',  55, 8.00,  110,  100,  800,  150,'Chemical Room',1,'55-gal drum'],
        ['CHM-017', 'Eco-Care Hand Soap 3L',         'Chemicals','Personal Safety','ECO-SOAP-3L',  'each',  1, 9.50,    4,    5,   60,   10,'Breakroom Supply',0,'3-liter dispenser refill'],
        ['CHM-018', 'Eco Wipes',                     'Chemicals','Personal Safety','ECO-WIPES',    'each',  1, 8.25,    6,    4,   60,   10,'Breakroom Supply',0,'Canister, surface-safe'],
        ['CHM-019', 'Foam Nox',                      'Chemicals','Sanitizers',   'ECO-FOAMNOX',  'gal',   1,18.50,   10,    8,  100,   15,'Chemical Room',1,''],
        ['CHM-020', 'Ster-Bac Foot Bath',            'Chemicals','Sanitizers',   'ECO-STERBAC',  'gal',  55, 7.50,  165,  100, 1000,  150,'Chemical Room',1,'55-gal drum, foot bath sanitizer'],
        ['CHM-021', 'Klem-Solv 55-Gal',             'Chemicals','Acid Rinse',   'ECO-KLEMSOLV', 'gal',  55,11.00,  500,  200, 2000,  400,'Chemical Room',1,'55-gal drum, acid CIP'],
        ['CHM-022', 'HC-10 Kleermore 1 Drum=450lbs', 'Chemicals','CIP Cleaners', 'ECO-KLEER450', 'lbs', 450, 0.95,  500,  200, 4000,  600,'Chemical Room',1,'Powder CIP, 450lb drum'],
        ['CHM-023', 'Mikron 304-Gal Tote',           'Chemicals','Sanitizers',   'ECO-MIK304',   'gal', 250, 7.50,  250,  100, 2000,  300,'Chemical Room',1,'Tote delivery'],
        ['CHM-024', 'Degreaser 55-Gal',              'Chemicals','Facility Clean','ECO-DEGREASE', 'gal',  55, 6.80,   40,   20,  300,   40,'Chemical Room',1,'55-gal drum'],
        ['CHM-025', 'Envirocid 55-Gal Drum',         'Chemicals','Sanitizers',   'ECO-ENVIROCID','gal',  55, 9.20,  245,  100, 2000,  300,'Chemical Room',1,'55-gal drum, sporicidal'],
        ['CHM-026', 'Heavy Duty Acid 53-Gal',        'Chemicals','Acid Rinse',   'ECO-HDA-53',   'gal',  53,12.00,   70,   20,  400,   60,'Chemical Room',1,'53-gal container'],
        ['CHM-027', 'Synergex 50-Gal Drum',          'Chemicals','CIP Cleaners', 'ECO-SYNERGEX', 'gal',  50, 8.80,  130,   80,  800,  150,'Chemical Room',1,'50-gal drum'],
    ],
    // ── Brenntag — Bulk Chemicals ──────────────────────────────────────────────
    'Brenntag': [
        ['CHM-028', 'Sodium Hypochlorite 55-Gal',    'Chemicals','Sanitizers',   'BRN-NAHYPO',   'gal',  55, 2.50,   25,   10,  200,   30,'Bulk Chemical Tank',1,'55-gal drum, 12.5% solution'],
        ['CHM-029', 'Baume Sulfuric Acid 15-Gal',    'Chemicals','Acid Rinse',   'BRN-H2SO4-15', 'gal',  15,18.00,   85,   10,  200,   20,'Bulk Chemical Tank',1,'15-gal container, 66° Baumé'],
    ],
    // ── Garrett-Callahan — Water Treatment ────────────────────────────────────
    'Garrett-Callahan': [
        ['CHM-030', 'Formula 1100 Water Treatment 55-Gal',  'Chemicals','Water Treatment','GC-1100',   'gal',55, 9.00,  40, 10, 200, 20,'Chemical Room',1,'Boiler/cooling water treatment'],
        ['CHM-031', 'Formula 2211 Water Treatment 55-Gal',  'Chemicals','Water Treatment','GC-2211',   'gal',55,11.00,  35, 10, 200, 20,'Chemical Room',1,''],
        ['CHM-032', 'Formula 159 Water Treatment 55-Gal',   'Chemicals','Water Treatment','GC-159',    'gal',55, 8.50,  30, 10, 200, 20,'Chemical Room',1,''],
        ['CHM-033', 'Formula 47 Water Treatment 55-Gal',    'Chemicals','Water Treatment','GC-47',     'gal',55, 7.50,  30,  5, 150, 15,'Chemical Room',1,''],
        ['CHM-034', 'Formula 250 Water Treatment 55-Gal',   'Chemicals','Water Treatment','GC-250',    'gal',55, 8.00,  15,  5, 100, 10,'Chemical Room',1,''],
        ['CHM-035', 'Formula LC 5-Gal',                     'Chemicals','Water Treatment','GC-LC-5',   'gal', 5,14.00,   3,  1,  20,  3,'Chemical Room',1,'5-gal pail'],
    ],
    // ── Motion Industries — Lubrication & Electrical ───────────────────────────
    'Motion Industries': [
        ['CON-011', 'FGL-0 Lubriplate Grease 1/4 Drum',  'Consumables','Lubrication','LO230',  'lbs',12.5,28.00,  0, 10, 100, 15,'Maintenance Supply',0,'NSF H1, food-grade grease'],
        ['CON-012', 'FGL-2 Lubriplate Grease 1/4 Drum',  'Consumables','Lubrication','LO230',  'lbs',12.5,28.00, 70, 10, 200, 20,'Maintenance Supply',0,'NSF H1 food-grade, #2 consistency'],
        ['CON-013', 'L32T8-17-50-BC-PC 4ft LED Bulbs',   'Consumables','Lighting',   'L32T8',  'each', 1, 4.80,  9,  9, 100, 20,'Maintenance Supply',0,'4ft, 17W, 5000K, shatter-proof'],
    ],
    // ── MDI — Mobil Lubricating Oils ───────────────────────────────────────────
    'MDI': [
        ['CON-014', 'Mobil SHC 634 55-Gal Drum',      'Consumables','Lubrication','SHC634-55',  'gal',55,14.50, 55, 10, 200, 30,'Maintenance Supply',0,'Synthetic gear oil, NSF H1'],
        ['CON-015', 'Mobil DTE Heavy 5-Gal Pale',     'Consumables','Lubrication','DTE-HEAVY-5','gal', 5,11.50,  2,  2,  30,  5,'Maintenance Supply',0,'Hydraulic oil'],
        ['CON-016', 'Mobil DTE 24 55-Gal Drum',       'Consumables','Lubrication','DTE24-55',   'gal',55,12.00,120, 10, 300, 40,'Maintenance Supply',0,'AW hydraulic oil'],
        ['CON-017', 'Mobil DTE BB 55-Gal Drum',       'Consumables','Lubrication','DTEBB-55',   'gal',55,12.50, 55, 10, 200, 30,'Maintenance Supply',0,'Turbine/bearing oil'],
        ['CON-018', 'Mobil DTE Light 55-Gal Drum',    'Consumables','Lubrication','DTELIGHT-55','gal',55,11.80, 40, 10, 200, 30,'Maintenance Supply',0,'Light circulating oil'],
    ],
    // ── Office Pro / Carlisle — Lubrication Supplies ──────────────────────────
    'Office Pro / Carlisle': [
        ['CON-019', 'Haynes Spray Lube (6 per cs)',    'Consumables','Lubrication','MHS',     'cs',  6,  9.50, 24,  6, 100, 12,'Maintenance Supply',0,'Aerosol food-grade chain lube, 6/case'],
        ['CON-020', 'CIP Lube Tubes (12 tubes/box)',   'Consumables','Lubrication','CIPL-12', 'box',12,  7.80, 44, 12, 120, 24,'Maintenance Supply',0,'Inline CIP lube, 12/box'],
    ],
    // ── Sentry Safety — PPE & Sanitation Consumables ──────────────────────────
    'Sentry Safety': [
        ['CON-021', 'Hair Nets 19" Boufante (Pkg)',   'Consumables','PPE','DPHNZ41',    'pkg',100,  4.50,100,100,2000,200,'Breakroom Supply',0,'100/pkg, nylon boufante, white'],
        ['CON-022', 'Beard Covers (Pkg/100)',          'Consumables','PPE','BEARD-CVR',  'pkg',100,  6.20,300,100,2000,200,'Breakroom Supply',0,'100/pkg'],
        ['CON-023', 'Pairs Rubber Gloves Size 9',      'Consumables','PPE','5409S-9',    'each',  1,  2.80, 24, 20,  300, 40,'Breakroom Supply',0,'Chemical-resistant'],
        ['CON-024', 'Boxes Ear Plugs (Pkg/200)',       'Consumables','PPE','P2001',      'box',200,  8.50,  2,  2,   50,  5,'Breakroom Supply',0,'Foam, uncorded, NRR 29'],
        ['CON-025', 'Face Masks 3M 20-Pk',            'Consumables','PPE','8210',       'pk', 20,  9.75,  0, 10,  100, 15,'Breakroom Supply',0,'N95, 20/pk'],
        ['CON-026', 'Can Liners 45-Gal (Case)',        'Consumables','Sanitation','SSS12047','cs', 100, 12.50, 1,  3,   60,  6,'Sanitation Supply',0,'100/cs, 1.2 mil'],
        ['CON-027', 'Can Liners 33-Gal (Case)',        'Consumables','Sanitation','SSS1Z186','cs', 100,  9.80, 0,  3,   60,  6,'Sanitation Supply',0,'100/cs'],
    ],
    // ── Nelson Jameson — Lab Supplies & Sanitation Brushes ────────────────────
    'Nelson Jameson': [
        ['CON-028', 'Anderson Chart HTST Line',           'Consumables','Lab Supplies','033-7087','each',  1, 2.50, 200,  50,  600,  100,'Lab Storage',0,'002-153-05'],
        ['CON-029', 'Anderson Chart CT1,CT2,RT1,RT2',     'Consumables','Lab Supplies','003-7108','each',  1, 2.50, 200,  50,  600,  100,'Lab Storage',0,'0021S800'],
        ['CON-030', 'Anderson Chart HTST',                'Consumables','Lab Supplies','033-7112','each',  1, 2.50, 200,  50,  600,  100,'Lab Storage',0,'002-154-01'],
        ['CON-031', 'Part Chart COP',                     'Consumables','Lab Supplies','518-1101','each',  1, 2.50, 200,  50,  600,  100,'Lab Storage',0,'002-138-38'],
        ['CON-032', 'Boxes Air Blow Filter Disc',         'Consumables','Lab Supplies','394-1986','each',  1,18.00, 1.7,  1,   20,    2,'Lab Storage',0,''],
        ['CON-033', 'Boxes Air Blow Filter Disc 1.5"',    'Consumables','Lab Supplies','304-1965','each',  1,20.00,   1,  1,   20,    2,'Lab Storage',0,''],
        ['CON-034', 'Schwartz Air Vent Filter',           'Consumables','Lab Supplies','591-2040','each',  1,14.00,   2,  1,   20,    2,'Lab Storage',0,''],
        ['CON-035', 'Kimble Test Tubes case/1000',        'Consumables','Lab Supplies','47729-572','cs',1000, 45.00,  2,  1,   10,    2,'Lab Storage',0,''],
        ['CON-036', 'Kimwipes Case',                      'Consumables','Lab Supplies','37116004','cs',  1, 38.00,  6,  2,   30,    4,'Lab Storage',0,''],
        ['CON-037', '3M Pipettes Box',                    'Consumables','Lab Supplies','5486',    'box',  1, 22.00,  3,  2,   20,    4,'Lab Storage',0,''],
        ['CON-038', '4oz Sample Bags',                    'Consumables','Lab Supplies','11216-012','cs', 1,  8.50,  4,  2,   40,    5,'Lab Storage',0,''],
        ['CON-039', '18oz Sample Bags',                   'Consumables','Lab Supplies','',        'cs',  1,  9.50,  2,  1,   20,    3,'Lab Storage',0,''],
        ['CON-040', 'Bags gr-531 Cultures 10-bag/box',    'Consumables','Lab Supplies','002-0231za','bx',1,185.00,  5,  6,   36,   10,'Freezer Storage',0,'Keep frozen'],
        ['CON-041', 'Bags gr-533 Cultures 10 order 2-bx','Consumables','Lab Supplies','002-0233za','bx',1,165.00,  0,  4,   20,    6,'Freezer Storage',0,'Keep frozen'],
        // Sanitation Brushes — color-coded per HACCP zone
        ['CON-042', 'Yellow Bottle Brush Qt',        'Consumables','Sanitation Brushes','6187880','each',1, 8.50,  6, 4,  40, 8,'Sanitation Supply',0,'Yellow = raw/pre-wash zone'],
        ['CON-043', 'Red Bottle Brush Qt',           'Consumables','Sanitation Brushes','6187882','each',1, 8.50,  4, 4,  40, 8,'Sanitation Supply',0,'Red = high-risk zone'],
        ['CON-044', 'Blue Bottle Brush Qt',          'Consumables','Sanitation Brushes','6187983','each',1, 8.50,  7, 4,  40, 8,'Sanitation Supply',0,'Blue = post-pasteurization'],
        ['CON-045', 'White Wall Brush',              'Consumables','Sanitation Brushes','6186965','each',1,12.50, 21, 6,  60,10,'Sanitation Supply',0,'White = ready-to-eat areas'],
        ['CON-046', 'Yellow Wall Brush',             'Consumables','Sanitation Brushes','6180795','each',1,12.50,  4, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-047', 'Blue Wall Brush',               'Consumables','Sanitation Brushes','5186785','each',1,12.50,  3, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-048', 'Blue Floor Sweep 18"',          'Consumables','Sanitation Brushes','6186701','each',1,18.00,  1, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-049', 'Red Floor Sweep 24"',           'Consumables','Sanitation Brushes','6185833','each',1,20.00,  3, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-050', 'Floor Drain Handles 48"',       'Consumables','Sanitation Brushes','6186412','each',1,14.00,  2, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-051', 'White 12" Floor Scrub Brush',   'Consumables','Sanitation Brushes','',       'each',1,16.50,  5, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-052', 'Yellow 12" Floor Scrub Brush',  'Consumables','Sanitation Brushes','',       'each',1,16.50,  5, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-053', 'Blue 12" Floor Scrub Brush',    'Consumables','Sanitation Brushes','',       'each',1,16.50,  4, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-054', 'Red 12" Floor Scrub Brush',     'Consumables','Sanitation Brushes','',       'each',1,16.50,  0, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-055', 'Yellow 7.5" Round Tank Brush',  'Consumables','Sanitation Brushes','',       'each',1,22.50,  5, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-056', 'Red 7.5" Round Tank Brush',     'Consumables','Sanitation Brushes','',       'each',1,22.50,  1, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-057', 'Blue 7.5" Round Tank Brush',    'Consumables','Sanitation Brushes','',       'each',1,22.50,  0, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-058', '1" White Brush',                'Consumables','Sanitation Brushes','',       'each',1, 5.50, 11, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-059', '1.5" White Brush',              'Consumables','Sanitation Brushes','',       'each',1, 6.50,  3, 4,  40, 8,'Sanitation Supply',0,''],
        ['CON-060', 'Blue Curved Pipe Brush',        'Consumables','Sanitation Brushes','',       'each',1,14.00,  0, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-061', 'Red Curved Pipe Brush',         'Consumables','Sanitation Brushes','',       'each',1,14.00,  2, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-062', 'Red Floor Brush 14"',           'Consumables','Sanitation Brushes','420-2912','each',1,19.00, 0, 2,  20, 4,'Sanitation Supply',0,''],
        ['CON-063', 'Blue Squeegee',                 'Consumables','Sanitation Brushes','618-8326','each',1,12.00,  7, 4,  60, 8,'Sanitation Supply',0,'Floor squeegee, blue zone'],
    ],
    // ── Carlvise — Specialty Brushes ──────────────────────────────────────────
    'Carlvise': [
        ['CON-064', 'Bassine Buffer Brush w/4192 Clutch','Consumables','Sanitation Brushes','361500BA','each',1,38.00, 4, 2, 20, 4,'Sanitation Supply',0,'15" bassine fiber, heavy-duty scrubbing'],
    ],
    // ── Carter Paper — Packaging & Facility Supplies ──────────────────────────
    'Carter Paper': [
        ['CON-065', 'Box Tape 2" for Boxer 8rolls/cs',   'Consumables','Packaging Supplies','10078225','cs', 8, 22.00, 30, 10, 200, 24,'Warehouse Supply',0,''],
        ['CON-066', 'Box Tape 3" for Boxer 4rolls/cs',   'Consumables','Packaging Supplies','10036273','cs', 4, 18.50,  8,  4, 100, 10,'Warehouse Supply',0,''],
        ['CON-067', 'Masking Tape 3616483',               'Consumables','Packaging Supplies','10038049','roll',1, 6.80, 18,  6,  80, 12,'Warehouse Supply',0,''],
        ['CON-068', 'Box Sealing Tape 10035270',          'Consumables','Packaging Supplies','10029054','roll',1, 5.50, 24,  8, 100, 16,'Warehouse Supply',0,''],
        ['CON-069', 'Cases Toilet Tissue',                'Consumables','Facility','10049624','cs',     1, 32.00,  1,  2,  30,  4,'Breakroom Supply',0,''],
        ['CON-070', 'Cases Roll Towel',                   'Consumables','Facility','10093052','cs',     1, 28.50, 0.5, 2, 30,  4,'Breakroom Supply',0,'6-roll cases'],
        ['CON-071', 'Cases Cold Drink Cup 7oz',           'Consumables','Facility','10029682','cs',     1, 14.50,  1,  2,  30,  4,'Breakroom Supply',0,''],
        ['CON-072', 'Paper Sacks 12x7x17 57# 500/bk',    'Consumables','Packaging Supplies','10058725','bk',500, 44.00, 1,  2,  20,  3,'Warehouse Supply',0,'Multiwall kraft'],
        ['CON-073', 'Stretch Film LFHP-185 4rolls/cs',   'Consumables','Packaging Supplies','10294635','cs', 4, 68.00, 32, 16, 200, 32,'Warehouse Supply',0,'Hand-wrap stretch film'],
    ],
    // ── R.V. Evans — Strapping ────────────────────────────────────────────────
    'R.V. Evans': [
        ['CON-074', 'Poly Strapping HD723',           'Consumables','Packaging Supplies','2X1613','roll',1, 48.00,  0, 8, 100, 16,'Warehouse Supply',0,'Heavy duty 2x1613'],
    ],
    // ── Frontier Bag — Poly Bags ──────────────────────────────────────────────
    'Frontier Bag': [
        ['PKG-044', 'Poly Bags PBR 33x11.25x67x.015', 'Packaging','Film & Wrap','PBR-33x11','each',1000, 0.18, 10, 4, 100, 10,'Packaging Warehouse',0,'Case liners'],
    ],
    // ── Buckeye Products — Thermal Consumables ────────────────────────────────
    'Buckeye Products': [
        ['CON-075', 'Thermal Transfer Ribbons (Case/24)','Consumables','Lab Supplies','TR4085','cs',24, 68.00, 3, 2, 20, 4,'Packaging Warehouse',0,'For dating/coding equipment'],
        ['CON-076', 'Thermal Labels 2000/box',          'Consumables','Lab Supplies','4x12 Blanks','bx',2000, 45.00, 3, 2, 30, 4,'Packaging Warehouse',0,'4x12 blank stock'],
    ],
    // ── D.S.I. — Process Documentation ───────────────────────────────────────
    'D.S.I.': [
        ['CON-077', 'Meter Tickets',                   'Consumables','Lab Supplies','TK171-T','bk', 1, 38.00, 2.5, 1, 20, 2,'Lab Storage',0,'Process meter chart tickets'],
    ],
    // ── J.J. Keller — Transport Compliance ───────────────────────────────────
    'J.J. Keller': [
        ['CON-078', 'Cases Tanker & Truck Seals Tug-Tight 15"','Consumables','Transport','TUG-15','cs',1, 28.00, 10, 3, 60, 6,'Shipping Area',0,'DOT-compliant tamper seals'],
    ],
    // ── Carlinville — Tanker Tags ─────────────────────────────────────────────
    'Carlinville': [
        ['CON-079', 'Boxes Tanker Sanitizing Tags',    'Consumables','Transport','TANK-TAG','bx',1, 18.00, 0, 2, 30, 4,'Shipping Area',0,'Sanitary seal tags for tanker trucks'],
    ],
    // ── F&H Equipment — General Supplies ─────────────────────────────────────
    'F&H Equipment': [
        ['CON-080', 'Scotchbrite Pads 20/box',        'Consumables','Sanitation','96','bx',20, 12.50, 2, 2, 30, 4,'Sanitation Supply',0,'General scrubbing pads'],
    ],
    // ── IMS Partners — Coder Supplies ────────────────────────────────────────
    'IMS Partners': [
        ['CON-081', 'Bottles Ink',                    'Consumables','Lab Supplies','JP-67','each',1, 28.00, 4, 2, 30, 4,'Maintenance Supply',0,'Inkjet coder ink'],
        ['CON-082', 'Bottles Make-Up Fluid',          'Consumables','Lab Supplies','TH-type-A','each',1, 22.00, 6, 3, 40, 6,'Maintenance Supply',0,'Inkjet coder make-up fluid'],
    ],
    // ── New Pig Corp — Spill Control ──────────────────────────────────────────
    'New Pig Corp': [
        ['CON-083', 'Barrel Top Absorbent Mats',      'Consumables','Facility','MAT544','each',1, 4.50, 0, 5, 50, 10,'Maintenance Supply',0,'55-gal drum top mats'],
        ['CON-084', 'Absorbent Socks 3"x48"',         'Consumables','Facility','4048','each',1, 6.80, 0, 5, 50, 10,'Maintenance Supply',0,'Spill control'],
        ['CON-085', 'Hand Wipes',                     'Consumables','Facility','MAT427','each',1, 8.50, 0, 5, 60, 10,'Breakroom Supply',0,'Industrial hand wipes'],
    ],
    // ── Cleveland Spec — Identification Tags ──────────────────────────────────
    'Cleveland Spec': [
        ['CON-086', 'Tags Red',         'Consumables','Lab Supplies','','each',1, 0.12, 1, 0.5, 10, 1,'Lab Storage',0,'Colored ID tags'],
        ['CON-087', 'Tags Pink',        'Consumables','Lab Supplies','','each',1, 0.12, 0.5,0.5,10, 1,'Lab Storage',0,''],
        ['CON-088', 'Tags Yellow',      'Consumables','Lab Supplies','','each',1, 0.12, 1.2,0.5,10, 1,'Lab Storage',0,''],
        ['CON-089', 'Tags Green',       'Consumables','Lab Supplies','','each',1, 0.12, 1.7,0.5,10, 1,'Lab Storage',0,''],
        ['CON-090', 'Tags Blue',        'Consumables','Lab Supplies','','each',1, 0.12, 0.2,0.5,10, 1,'Lab Storage',0,''],
        ['CON-091', 'Tags Violet/Purple','Consumables','Lab Supplies','','each',1,0.12, 1.1,0.5,10, 1,'Lab Storage',0,''],
        ['CON-092', 'Tags White',       'Consumables','Lab Supplies','','each',1, 0.12, 0, 0.5,10, 1,'Lab Storage',0,''],
        ['CON-093', 'Tags Black',       'Consumables','Lab Supplies','','each',1, 0.12, 1, 0.5,10, 1,'Lab Storage',0,''],
    ],
};

/**
 * Run expanded seed — adds only vendors/items not already present.
 * Safe to call on existing DBs (checks count before inserting).
 */
function seedDairyExpanded(db) {
    const vIns = db.prepare(`INSERT OR IGNORE INTO SupplyVendor
        (VendorName,Category,ContactName,Phone,Email,Website,LeadDays,Notes)
        VALUES (?,?,?,?,?,?,?,?)`);

    const iIns = db.prepare(`INSERT INTO SupplyItem
        (ItemCode,Description,Category,SubCategory,VendorID,VendorPartNo,UOM,PackSize,
         UnitCost,OnHand,MinStock,MaxStock,ReorderPt,StorageArea,HazMat,Notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    db.transaction(() => {
        // 1. Upsert vendors
        for (const v of VENDORS) {
            const exists = db.prepare('SELECT ID FROM SupplyVendor WHERE VendorName=?').get(v[0]);
            if (!exists) vIns.run(...v);
        }

        // 2. Build vendor name → ID map
        const vMap = {};
        db.prepare('SELECT ID, VendorName FROM SupplyVendor').all().forEach(r => { vMap[r.VendorName] = r.ID; });

        // 3. Insert items not already present (check by ItemCode)
        for (const [vendorName, items] of Object.entries(ITEMS_BY_VENDOR)) {
            const vid = vMap[vendorName] || null;
            for (const row of items) {
                const [code, ...rest] = row;
                if (code && db.prepare('SELECT ID FROM SupplyItem WHERE ItemCode=?').get(code)) continue;
                // row: [ItemCode, Desc, Cat, SubCat, VendorPartNo, UOM, PackSize, UnitCost, OnHand, Min, Max, ReorderPt, StorageArea, HazMat, Notes]
                const [, desc, cat, subcat, vPartNo, uom, packSize, unitCost, onHand, min, max, reorderPt, storageArea, hazMat, notes] = row;
                iIns.run(code, desc, cat, subcat, vid, vPartNo, uom, packSize, unitCost, onHand, min, max, reorderPt, storageArea, hazMat, notes);
            }
        }
    })();
}

module.exports = { seedDairyExpanded };
