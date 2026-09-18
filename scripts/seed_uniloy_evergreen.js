// Copyright © 2026 Trier OS. All Rights Reserved.
// scripts/seed_uniloy_evergreen.js
// Seeds MasterEquipment with model-specific Uniloy blow molding and Evergreen filler entries,
// then re-links CMS-EVERG-* parts to the new model-specific equipment type IDs.
//
// Usage: node scripts/seed_uniloy_evergreen.js [--dry-run]

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DRY_RUN = process.argv.includes('--dry-run');
const DB_PATH = path.join(__dirname, '..', 'data', 'mfg_master.db');

const db = new Database(DB_PATH, { readonly: DRY_RUN });
if (!DRY_RUN) db.pragma('journal_mode = WAL');

// ─── Equipment records ─────────────────────────────────────────────────────

const EQUIPMENT = [
    // ── Uniloy blow molders ─────────────────────────────────────────────────
    {
        EquipmentTypeID: 'UNILOY_250R1',
        Description: 'Uniloy Model 250 R1 Blow Molding Machine',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Uniloy']),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([
            'parison head wear', 'clamp cylinder seal failure', 'extruder screw wear',
            'hydraulic pump cavitation', 'cooling line scale buildup'
        ]),
        ExpectedMTBF_Hours: 4000,
        ExpectedMTTR_Hours: 3.5,
        UsefulLifeYears: 25,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            heads: 4,
            manifold: '4-head',
            head_centers_in: 6.125,
            extruder_screw_dia_in: 2.5,
            shot_capacity_g: 450,
            hdpe_output_lb_hr: 250,
            vfd: 'ABB',
            // Nameplate electrical (D-103563)
            voltage: 460,
            phase: 3,
            hz: 60,
            fla_a: 120,
            drive_motor_hp: 40,
            breaker_int_cap_a: 30000,
            schematic: 'D-103563',
            plant_mfg_location: 'Manchester, MI'
        })
    },
    {
        EquipmentTypeID: 'UNILOY_350R2',
        Description: 'Uniloy Model 350 R2 Blow Molding Machine',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Uniloy']),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([
            'parison head wear', 'clamp cylinder seal failure', 'extruder screw wear',
            'hydraulic pump cavitation', 'cooling line scale buildup', 'VFD fault'
        ]),
        ExpectedMTBF_Hours: 4000,
        ExpectedMTTR_Hours: 4.0,
        UsefulLifeYears: 25,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            heads: 8,
            manifold: '8-head',
            extruder_screw_dia_in: 3.5,
            shot_capacity_g: 900,
            clamp_force_ton: 90,
            platen_size_in: '44x15',
            tie_bars: 4,
            vfd: 'Allen-Bradley 1336 Plus II'
        })
    },
    {
        EquipmentTypeID: 'UNILOY_400R20',
        Description: 'Uniloy Model 400 R20 Blow Molding Machine',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Uniloy']),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([
            'parison head wear', 'clamp cylinder seal failure', 'extruder screw wear',
            'controller battery failure', 'cooling line scale buildup'
        ]),
        ExpectedMTBF_Hours: 3500,
        ExpectedMTTR_Hours: 4.0,
        UsefulLifeYears: 25,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            heads: 8,
            manifold: '8-head',
            head_centers_in: [8, 9],
            controller: 'Barber Colman Maco 8000',
            vintage_year: 1998
        })
    },
    {
        EquipmentTypeID: 'UNILOY_2010',
        Description: 'Uniloy Model 2010 Blow Molding Machine',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Uniloy']),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([
            'parison head wear', 'clamp cylinder seal failure', 'extruder screw wear',
            'hydraulic pump cavitation', 'control transformer failure'
        ]),
        ExpectedMTBF_Hours: 4000,
        ExpectedMTTR_Hours: 3.5,
        UsefulLifeYears: 25,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            // Nameplate electrical (D-832720)
            voltage: 230,
            phase: 3,
            hz: 60,
            flc_a: 120,
            control_circuit_v: 120,
            control_circuit_kva: 0.75,
            schematic: 'D-832720',
            plant_mfg_location: 'Saline, MI'
        })
    },
    {
        EquipmentTypeID: 'UNILOY_2014',
        Description: 'Uniloy Model 2014 Blow Molding Machine',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Uniloy']),
        PMIntervalDays: 90,
        CommonFailureModes: JSON.stringify([
            'parison head wear', 'clamp cylinder seal failure', 'extruder screw wear',
            'hydraulic pump cavitation', 'control transformer failure'
        ]),
        ExpectedMTBF_Hours: 4000,
        ExpectedMTTR_Hours: 3.5,
        UsefulLifeYears: 25,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            // Nameplate electrical (C-848606)
            phase: 3,
            hz: 60,
            flc_a: 99,
            control_circuit_v: 120,
            control_circuit_kva: 1.5,
            schematic: 'C-848606'
        })
    },

    // ── Evergreen fillers ───────────────────────────────────────────────────
    {
        EquipmentTypeID: 'EVERGREEN_N200',
        Description: 'Evergreen N-200 Eco-Pak Carton Filler',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Evergreen Packaging']),
        PMIntervalDays: 60,
        CommonFailureModes: JSON.stringify([
            'fill valve seal wear', 'top seal jaw failure', 'diaphragm fatigue',
            'conveyor chain stretch', 'carton guide wear'
        ]),
        ExpectedMTBF_Hours: 3000,
        ExpectedMTTR_Hours: 2.0,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            brand: 'Evergreen',
            model_series: 'N-200',
            package_name: 'Eco-Pak',
            sizes_oz: [4, 6, 8, 10, 12, 16],
            cph_4to10oz: 20400,
            cph_12to16oz: 16800,
            fill_type: 'gravity',
            container: 'gable_top_carton'
        })
    },
    {
        EquipmentTypeID: 'EVERGREEN_Q35',
        Description: 'Evergreen Q-35 Carton Filler',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Evergreen Packaging']),
        PMIntervalDays: 60,
        CommonFailureModes: JSON.stringify([
            'fill valve seal wear', 'top seal jaw failure', 'diaphragm fatigue',
            'conveyor chain stretch', 'carton guide wear'
        ]),
        ExpectedMTBF_Hours: 3000,
        ExpectedMTTR_Hours: 2.0,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            brand: 'Evergreen',
            model_series: 'Q-35',
            sizes_oz: [6, 8, 12, 16, 24, 32],
            cph_6to16oz: 4500,
            cph_24to32oz: 3500,
            fill_type: 'gravity',
            container: 'gable_top_carton'
        })
    },
    {
        EquipmentTypeID: 'EVERGREEN_Q70',
        Description: 'Evergreen Q-70 / EQ-70 Carton Filler',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Evergreen Packaging']),
        PMIntervalDays: 60,
        CommonFailureModes: JSON.stringify([
            'fill valve seal wear', 'top seal jaw failure', 'diaphragm fatigue',
            'conveyor chain stretch', 'carton guide wear'
        ]),
        ExpectedMTBF_Hours: 3000,
        ExpectedMTTR_Hours: 2.0,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            brand: 'Evergreen',
            model_series: 'EQ-70 / Q-70',
            sizes_oz: [6, 8, 12, 16, 24, 32],
            cph_6to16oz: 9000,
            cph_24to32oz: 7000,
            fill_type: 'gravity',
            container: 'gable_top_carton',
            note: 'EQ-70 is the enhanced/economy variant of Q-70'
        })
    },
    {
        EquipmentTypeID: 'EVERGREEN_H84',
        Description: 'Evergreen H-84 / EH-84 Half-Gallon/2L Carton Filler',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Evergreen Packaging']),
        PMIntervalDays: 60,
        CommonFailureModes: JSON.stringify([
            'fill valve seal wear', 'top seal jaw failure', 'diaphragm fatigue',
            'conveyor chain stretch', 'carton guide wear'
        ]),
        ExpectedMTBF_Hours: 3000,
        ExpectedMTTR_Hours: 2.5,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            brand: 'Evergreen',
            model_series: 'EH-84 / H-84',
            sizes_oz: [40, 48, 64],
            sizes_L: [1.5, 2.0],
            cph: 8400,
            fill_type: 'gravity',
            container: 'gable_top_carton',
            note: 'EH-84 is the enhanced variant of H-84'
        })
    },
    {
        EquipmentTypeID: 'EVERGREEN_EH210',
        Description: 'Evergreen EH-210 Half-Gallon/2L High-Speed Carton Filler',
        Category: 'PACKAGING',
        TypicalMakers: JSON.stringify(['Evergreen Packaging']),
        PMIntervalDays: 60,
        CommonFailureModes: JSON.stringify([
            'fill valve seal wear', 'top seal jaw failure', 'diaphragm fatigue',
            'conveyor chain stretch', 'servo drive fault'
        ]),
        ExpectedMTBF_Hours: 2800,
        ExpectedMTTR_Hours: 2.5,
        UsefulLifeYears: 20,
        TypicalWarrantyMonths: 12,
        Specifications: JSON.stringify({
            brand: 'Evergreen',
            model_series: 'EH-210',
            sizes_oz: [40, 48, 64],
            sizes_L: [1.5, 2.0],
            cph: 12600,
            fill_type: 'gravity',
            container: 'gable_top_carton'
        })
    }
];

// CMS Evergreen parts should link to all model-specific Evergreen types
// (seals/gaskets/diaphragms are generic across the line — valid for any Evergreen filler)
const EVERGREEN_TYPE_IDS = [
    'EVERGREEN_N200', 'EVERGREEN_Q35', 'EVERGREEN_Q70', 'EVERGREEN_H84', 'EVERGREEN_EH210'
];

// Uniloy parts link to all Uniloy models too
const UNILOY_TYPE_IDS = [
    'UNILOY_250R1', 'UNILOY_350R2', 'UNILOY_400R20', 'UNILOY_2010', 'UNILOY_2014'
];

// ─── Execute ───────────────────────────────────────────────────────────────

const insertEq = db.prepare(`
    INSERT OR REPLACE INTO MasterEquipment
        (EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays,
         CommonFailureModes, ExpectedMTBF_Hours, ExpectedMTTR_Hours,
         UsefulLifeYears, TypicalWarrantyMonths, Specifications)
    VALUES
        (@EquipmentTypeID, @Description, @Category, @TypicalMakers, @PMIntervalDays,
         @CommonFailureModes, @ExpectedMTBF_Hours, @ExpectedMTTR_Hours,
         @UsefulLifeYears, @TypicalWarrantyMonths, @Specifications)
`);

if (DRY_RUN) {
    console.log('[DRY RUN] Would insert/replace', EQUIPMENT.length, 'equipment records:');
    EQUIPMENT.forEach(e => console.log(' ', e.EquipmentTypeID, '—', e.Description));
} else {
    const insertAll = db.transaction(() => {
        for (const eq of EQUIPMENT) {
            insertEq.run(eq);
            console.log('  ✓', eq.EquipmentTypeID, '—', eq.Description);
        }
    });
    console.log('\nInserting', EQUIPMENT.length, 'equipment records...');
    insertAll();
    console.log('Done.\n');

    // Re-link CMS Evergreen parts
    const evergreenTypesJson = JSON.stringify(EVERGREEN_TYPE_IDS);
    const { changes: evChg } = db.prepare(`
        UPDATE MasterParts SET EquipmentTypes = ?
        WHERE MasterPartID LIKE 'CMS-EVERG-%'
    `).run(evergreenTypesJson);
    console.log(`Re-linked ${evChg} CMS Evergreen parts → [${EVERGREEN_TYPE_IDS.join(', ')}]`);

    // Update BLOW_MOLDER TypicalMakers to include Uniloy
    db.prepare(`
        UPDATE MasterEquipment SET TypicalMakers = ?
        WHERE EquipmentTypeID = 'BLOW_MOLDER'
    `).run(JSON.stringify(['Uniloy', 'Graham', 'Bekum', 'Kautex', 'Sidel', 'Cincinnati Milacron']));
    console.log('Updated BLOW_MOLDER TypicalMakers to include Uniloy');

    // Final count
    const eqCount = db.prepare("SELECT COUNT(*) as n FROM MasterEquipment WHERE Category = 'PACKAGING'").get();
    const uniloyCount = db.prepare("SELECT COUNT(*) as n FROM MasterEquipment WHERE EquipmentTypeID LIKE 'UNILOY_%'").get();
    const egCount = db.prepare("SELECT COUNT(*) as n FROM MasterEquipment WHERE EquipmentTypeID LIKE 'EVERGREEN_%'").get();
    console.log(`\nPackaging equipment total: ${eqCount.n}`);
    console.log(`  Uniloy models: ${uniloyCount.n}`);
    console.log(`  Evergreen models: ${egCount.n}`);
}

db.close();
