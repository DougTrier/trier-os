// Copyright © 2026 Trier OS. All Rights Reserved.
// Pre-flight validator for MasterWarrantyTemplates SQL injection files.
// Usage: node scripts/preflight_warranty.js <sql-file>

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const sqlFile = process.argv[2] || 'scripts/dairy_warranty_gap.sql';
const patchMode = process.argv.includes('--patch'); // skip full-coverage check
const sql = fs.readFileSync(sqlFile, 'utf8');
const db = new Database('data/mfg_master.db', { readonly: true });

// ── Parse rows ────────────────────────────────────────────────────────────────
// Split on INSERT OR IGNORE boundaries, then extract the VALUES tuple
const insertBlocks = sql.split(/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+MasterWarrantyTemplates/i).slice(1);
const rows = [];

for (const block of insertBlocks) {
    const valMatch = block.match(/VALUES\s*\(\s*([\s\S]*?)\s*\)\s*;/i);
    if (!valMatch) continue;
    const inner = valMatch[1];

    // Tokenise: respect single-quoted strings (with '' escaping) and bare NULL
    const tokens = [];
    let i = 0;
    while (i < inner.length) {
        while (i < inner.length && /[\s,]/.test(inner[i])) i++;
        if (i >= inner.length) break;
        if (inner[i] === "'") {
            let s = '';
            i++; // skip opening quote
            while (i < inner.length) {
                if (inner[i] === "'" && inner[i + 1] === "'") { s += "'"; i += 2; }
                else if (inner[i] === "'") { i++; break; }
                else { s += inner[i++]; }
            }
            tokens.push(s);
        } else {
            let word = '';
            while (i < inner.length && !/[\s,]/.test(inner[i])) word += inner[i++];
            tokens.push(word.toUpperCase() === 'NULL' ? null : word);
        }
    }

    if (tokens.length >= 7) {
        rows.push({
            equipmentType: tokens[0],
            vendorId:      tokens[1],
            months:        parseInt(tokens[2]) || 0,
            coverage:      tokens[3] || '',
            exclusions:    tokens[4] || '',
            claimProcess:  tokens[5] || '',
            extended:      tokens[6],
        });
    }
}

console.log(`Parsed ${rows.length} rows from ${sqlFile}\n`);

// ── Reference data ────────────────────────────────────────────────────────────
const validVendors = new Set(
    db.prepare('SELECT VendorID FROM MasterVendors').all().map(r => r.VendorID)
);

// Also accept vendor IDs declared in the file itself (so a combined inject file passes)
const vendorInsertRe = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+MasterVendors\s*\([^)]+\)\s*VALUES\s*\(\s*'([^']+)'/gi;
let vm;
while ((vm = vendorInsertRe.exec(sql)) !== null) validVendors.add(vm[1]);

const NEEDED = new Set([
    'BATCH_MIXER','BABCOCK_CENTRIFUGE','BACTOFUGE','BAG_IN_BOX','BALANCE_TANK',
    'BLOW_MOLDER','BOTTLE_FILLER','BRINE_SYSTEM','BUTTERMILK_LINE','BUTTER_CHURN',
    'BUTTER_CUTTER','BUTTER_PRINTER','BUTTER_REWORKER','BUTTER_SILO','CARTON_ERECTOR',
    'CASE_ERECTOR','CASE_PACKER','CERAMIC_FILTER','CHEESE_AGING_ROOM','CHEESE_CUTTER',
    'CHEESE_DRAIN_TABLE','CHEESE_PRESS','CHEESE_SALTER','CHEESE_SHREDDER','CHEESE_TOWER',
    'CHEESE_VACUUM_PACK','CHEESE_WAXER','CHEESE_WHEEL_TURNER','CHILLER','CIP_TANK',
    'CLARIFIER','COLD_SEPARATOR','COLONY_COUNTER','CONTINUOUS_FREEZER','CONVEYOR_BELT',
    'CONVEYOR_CHAIN','COOLING_TOWER','COP_TANK','COTTAGE_CHEESE_VAT','CRATE_WASHER',
    'CREAM_CHEESE_SYS','CREAM_RIPENING_TANK','CREAM_SEPARATOR_LEG','CREAM_TANK',
    'CRYOSCOPE','CRYSTALLIZER','CULTURE_DOSING','CUP_FILLER','DATE_CODER','DAY_TANK',
    'DEAERATOR','DEPALLETIZER','DESLUDGE_SEPARATOR','DIP_LINE','DOCK_LEVELER','DOCK_SEAL',
    'DOUBLE_TUBE_HX','ELECTRICAL_SWITCHGEAR','EMERGENCY_GENERATOR','ESL_SYSTEM',
    'FARM_BULK_TANK','FAT_STANDARDIZER','FIRE_SUPPRESSION','FLOOR_SCALE','FLOW_DIVERSION',
    'FLUID_BED_DRYER','FORKLIFT_LP','FRUIT_PREP','GALLON_FILLER','GAULIN_LEGACY',
    'GEARBOX','GLYCOL_SYSTEM','GRAVITY_CASE_SEALER','GREEK_STRAINER','HALF_GAL_FILLER',
    'HARDENING_TUNNEL','HIGH_SHEAR_MIXER','HMI_PANEL','HOMOGENIZER_2STAGE',
    'HOMOGENIZER_ASEPTIC','HOMOGENIZER_SINGLE','HTST_CONTROLS','HTST_COOLING',
    'HTST_HEATING','HTST_REGEN','HVAC_AHU','HVLS_FAN','IC_AGING_TANK','IC_BATCH_FREEZER',
    'IC_CONE_FILLER','IC_DIPPING_CABINET','IC_EXTRUSION','IC_FLAVOR_INJECTOR',
    'IC_INGREDIENT_WEIGH','IC_MIX_PROCESSOR','IC_NOVELTY_LINE','IC_SANDWICH_MAKER',
    'INGREDIENT_TANK','INLINE_STRAINER','KEFIR_FERMENTER','LABELER','LAB_HOMOGENIZER',
    'LACTOSE_CRYSTALLIZER','LACTOSE_DRYER','LEGACY_AGITATOR','LEGACY_AIR_VALVE',
    'LEGACY_CHART_RECORDER','LEGACY_CIP_SKID','LEGACY_FILLER','LEGACY_HOMOGENIZER',
    'LEGACY_MERCURY_THERM','LEGACY_MOTOR_DC','LEGACY_PNEUMATIC_XMTR','LEGACY_PUMP_DEMING',
    'LEGACY_SEPARATOR','LEGACY_VALVE_MANUAL','LEGACY_VAT_PASTEURIZER','LEVEL_SENSOR',
    'LIQUID_BLENDER','MEMBRANE_FILTER','MILK_METER','MILK_RECEIVER','MILK_STANDARDIZER',
    'MIX_TANK','MOZZ_BRINE_COOLER','MOZZ_COOKER','MOZZ_MOLDER','MVR_EVAPORATOR',
    'NF_SYSTEM','ORDER_PICKER','OVERHEAD_DOOR','PALLET_JACK_ELEC','PALLET_WRAPPER',
    'PERMEATE_SYSTEM','PHE_STANDALONE','PH_METER','PINT_FILLER','PLATE_CHILLER',
    'PLATE_COOLER','PNEUMATIC_VALVE','POWDER_BAGGING','POWDER_BLENDER','POWDER_FUNNEL',
    'POWDER_SIFTER','POWDER_SILO','PROCESS_TANK','RAW_MILK_SILO','REACH_TRUCK',
    'RECEIVING_BAY','RECIP_COMPRESSOR','RECOMBINATION_SYS','RECORDING_CHART',
    'REVERSE_OSMOSIS','ROOF_TOP_UNIT','SEPARATOR','SHRINK_WRAPPER','SILO_HORIZONTAL',
    'SILO_VERTICAL','SKIM_TANK','SLEEVE_WRAPPER','SOMATIC_COUNTER','SOUR_CREAM_LINE',
    'SSHE','STEAM_CONDENSATE','STEAM_INFUSION','STEAM_INJECTION','SURGE_TANK',
    'TANKER_WASH','TEMP_RECORDER','TRAY_PACKER','TRENCH_DRAIN','TRUCK_SCALE',
    'TUBULAR_HX','TUBULAR_PASTEURIZER','UF_SYSTEM','UPS_SYSTEM','WALK_IN_COOLER',
    'WALK_IN_FREEZER','WASTEWATER','WATER_SOFTENER','WEIGH_TANK','WHEY_CREAM_SEPARATOR',
    'WHEY_DRAIN','WHEY_PASTEURIZER','WHEY_PROCESSOR','WHEY_PROTEIN_SYSTEM','WHEY_RO',
    'WHEY_SILO','XRAY_INSPECT','YOGURT_COOLER','YOGURT_INCUBATOR','AMF_SYSTEM',
    'AMMONIA_SYSTEM','ASEPTIC_FILLER','ASEPTIC_TANK','BATCH_PASTEURIZER',
]);

const BOILERPLATE = [
    'standard parts and labor for 12 months',
    'standard parts and labor for',
    'submit claim via vendor portal',
    'wear parts such as seals, gaskets, and filters',
    'wear parts such as seals, gaskets, and elastomers',
    'mechanical components, motors, and controls against manufacturing defects',
    'contact the vendor',
    '30 days of failure',
    // Template-filler patterns caught after mfg_inject v1 rejection
    'internal motion axes, structural frame elements, and integrated control panels against factory defects',
    'consumable elements intrinsic to the',
    'cutting media, load-bearing wheels, or sacrificial liners',
    'failures induced by exceeding specified environmental or load thresholds will void this policy',
    'to initiate a warranty ticket. provide machine serial number to the dispatcher',
    'industrial hydraulics component',
    'industrial pneumatics component',
    'industrial filtration component',
    'industrial seals component',
    'industrial tooling component',
    'industrial electrical component',
    'industrial fluids component',
    'industrial mechanical component',
    'industrial safety component',
    'industrial bearings component',
    'covering heavy duty specs',
];

// Wrong vendor-equipment pairings (vendor → equipment types it should NOT cover)
const WRONG_PAIRINGS = [
    { vendor: 'FRISTAM',      badTypes: ['COOLING_TOWER','CHILLER','BOILER','ELECTRICAL_SWITCHGEAR','PLC','HMI_PANEL','FLOOR_SCALE','TRUCK_SCALE','DOCK_LEVELER','DOCK_SEAL','FORKLIFT_LP','FIRE_SUPPRESSION'] },
    { vendor: 'AMPCO',        badTypes: ['COOLING_TOWER','CHILLER','BOILER','ELECTRICAL_SWITCHGEAR','PLC','FLOOR_SCALE','TRUCK_SCALE','DOCK_LEVELER','FORKLIFT_LP','FIRE_SUPPRESSION'] },
    { vendor: 'SANI_MATIC',   badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','ELECTRICAL_SWITCHGEAR','FLOOR_SCALE','TRUCK_SCALE','FORKLIFT_LP','FORKLIFT_ELEC'] },
    { vendor: 'CROWN',        badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','ELECTRICAL_SWITCHGEAR','PLC','HMI_PANEL','SEPARATOR','HOMOGENIZER','EVAPORATOR'] },
    { vendor: 'TOYOTA_FL',    badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','ELECTRICAL_SWITCHGEAR','PLC','SEPARATOR','HOMOGENIZER','EVAPORATOR'] },
    { vendor: 'CLEAVER_BROOKS',badTypes: ['CHILLER','SEPARATOR','HOMOGENIZER','FORKLIFT_LP','FORKLIFT_ELEC','FLOOR_SCALE','TRUCK_SCALE','DOCK_LEVELER'] },
    { vendor: 'ECOLAB',       badTypes: ['CHILLER','BOILER','SEPARATOR','HOMOGENIZER','FORKLIFT_LP','ELECTRICAL_SWITCHGEAR','FLOOR_SCALE'] },
    { vendor: 'RITE_HITE',    badTypes: ['CHILLER','BOILER','SEPARATOR','HOMOGENIZER','ELECTRICAL_SWITCHGEAR','PLC','FORKLIFT_LP'] },
    { vendor: 'FOSS',         badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','CONVEYOR_BELT','CONVEYOR_CHAIN','FORKLIFT_LP','ELECTRICAL_SWITCHGEAR'] },
    { vendor: 'METTLER_TOLEDO',badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','CONVEYOR_BELT','FORKLIFT_LP','PLC','HMI_PANEL','SEPARATOR','HOMOGENIZER'] },
    { vendor: 'VIDEOJET',     badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','SEPARATOR','HOMOGENIZER','FORKLIFT_LP','ELECTRICAL_SWITCHGEAR','FLOOR_SCALE'] },
    { vendor: 'MARKEM',       badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','SEPARATOR','HOMOGENIZER','FORKLIFT_LP','ELECTRICAL_SWITCHGEAR','FLOOR_SCALE'] },
    { vendor: 'WEXXAR',       badTypes: ['CHILLER','BOILER','AMMONIA_SYSTEM','SEPARATOR','HOMOGENIZER','FORKLIFT_LP','ELECTRICAL_SWITCHGEAR'] },
];

// ── Run checks ────────────────────────────────────────────────────────────────
const issues = { critical: [], warning: [] };
const coveredTypes = new Set();
const coverageIndex = new Map(); // text → first equipmentType that used it
const monthCounts = {};

rows.forEach((r, i) => {
    const tag = `Row ${i + 1} [${r.equipmentType}]`;
    coveredTypes.add(r.equipmentType);

    // CRITICAL: invalid vendor
    if (!validVendors.has(r.vendorId)) {
        issues.critical.push(`${tag}: INVALID VendorID "${r.vendorId}"`);
    }

    // CRITICAL: boilerplate text
    BOILERPLATE.forEach(bp => {
        if (r.coverage.toLowerCase().includes(bp) ||
            r.claimProcess.toLowerCase().includes(bp) ||
            r.exclusions.toLowerCase().includes(bp)) {
            issues.critical.push(`${tag}: BOILERPLATE → "${bp}"`);
        }
    });

    // CRITICAL: duplicate coverage description
    const key = r.coverage.trim().toLowerCase();
    if (coverageIndex.has(key)) {
        issues.critical.push(`${tag}: DUPLICATE coverage text (same as [${coverageIndex.get(key)}])`);
    } else {
        coverageIndex.set(key, r.equipmentType);
    }

    // CRITICAL: legacy should have 0 months
    if (r.equipmentType.startsWith('LEGACY_') && r.months > 0) {
        issues.critical.push(`${tag}: Legacy should have 0 months, has ${r.months}`);
    }
    // CRITICAL: non-legacy should not be 0
    if (!r.equipmentType.startsWith('LEGACY_') && r.months === 0) {
        issues.critical.push(`${tag}: Non-legacy has 0 months`);
    }

    // WARNING: wrong vendor-equipment pairing
    WRONG_PAIRINGS.forEach(({ vendor, badTypes }) => {
        if (r.vendorId === vendor && badTypes.includes(r.equipmentType)) {
            issues.warning.push(`${tag}: Suspicious pairing — ${vendor} doesn't typically service ${r.equipmentType}`);
        }
    });

    // WARNING: very short coverage/claim text (< 40 chars = probably not specific)
    if (r.coverage.length < 40) {
        issues.warning.push(`${tag}: Coverage too short (${r.coverage.length} chars) — "${r.coverage}"`);
    }
    if (r.claimProcess.length < 30) {
        issues.warning.push(`${tag}: ClaimProcess too short (${r.claimProcess.length} chars)`);
    }

    // Month distribution
    if (!r.equipmentType.startsWith('LEGACY_')) {
        monthCounts[r.months] = (monthCounts[r.months] || 0) + 1;
    }
});

// CRITICAL: missing equipment types (skip in patch mode)
if (!patchMode) {
    NEEDED.forEach(t => {
        if (!coveredTypes.has(t)) {
            issues.critical.push(`MISSING: no template for ${t}`);
        }
    });
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════');
console.log('MONTH DISTRIBUTION (non-legacy):');
Object.entries(monthCounts).sort((a,b) => a[0]-b[0])
    .forEach(([m, n]) => console.log(`  ${m}mo: ${n} rows`));

console.log('\nUNIQUE COVERAGE TEXTS:', coverageIndex.size, '/', rows.length);

console.log('\n═══════════════════════════════════════');
console.log(`CRITICAL ISSUES: ${issues.critical.length}`);
issues.critical.forEach(i => console.log('  ✗ CRIT:', i));

console.log(`\nWARNINGS: ${issues.warning.length}`);
issues.warning.slice(0, 20).forEach(i => console.log('  ⚠ WARN:', i));
if (issues.warning.length > 20) console.log(`  ... and ${issues.warning.length - 20} more warnings`);

console.log('\n═══════════════════════════════════════');
if (issues.critical.length === 0) {
    console.log('✓ PASS — no critical issues. Safe to inject.');
    if (issues.warning.length > 0) console.log('  Review warnings above before proceeding.');
} else {
    console.log('✗ FAIL — fix critical issues before injecting.');
    process.exit(1);
}

db.close();
