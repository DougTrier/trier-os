// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * IT asset cleanup plans shared by plant reset and selected-asset deletion.
 * Only current assignments, installation links and computed depreciation are
 * removed with an asset. Movement and work-order history remain available.
 * No HTTP routes; SQL identifiers come exclusively from fixed allowlists.
 */
const ASSET_TABLES = Object.freeze({ software: 'it_software', hardware: 'it_hardware',
    infrastructure: 'it_infrastructure', mobile: 'it_mobile' });

function assetCleanupPlan(category, plantId, id = null, schema = 'main') {
    if (!Object.hasOwn(ASSET_TABLES, category) || !['main', 'reset_logistics'].includes(schema)) {
        throw new Error('Invalid IT cleanup scope.');
    }
    const table = ASSET_TABLES[category];
    const where = id === null ? 'PlantID IS ?' : 'PlantID IS ? AND ID = ?';
    const params = id === null ? [plantId] : [plantId, id];
    const select = `SELECT ID FROM ${schema}.${table} WHERE ${where}`;
    const plan = ['it_asset_user_link', 'it_depreciation_schedule'].map(child => ({
        table: child, schema, where: `AssetCategory = ? AND AssetID IN (${select})`, params: [category, ...params],
    }));
    if (category === 'software' || category === 'hardware') {
        plan.push({ table: 'it_software_hardware_link', schema,
            where: `${category === 'software' ? 'SoftwareID' : 'HardwareID'} IN (${select})`, params });
    }
    plan.push({ table, schema, where, params });
    return plan;
}

module.exports = { ASSET_TABLES, assetCleanupPlan };
