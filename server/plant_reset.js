// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Plant reset execution for POST /api/database/reset-plant.
 * Uses the caller's AsyncLocalStorage-resolved connection and attaches the
 * existing logistics database for scoped IT cleanup in the same transaction.
 * Shared safety, auth, audit, movement and work-order history are retained.
 * SQLite WAL provides rollback on SQL failure, not crash-atomic commits across
 * database files; both pre-reset backups must be kept for recovery.
 */
const { assetCleanupPlan, ASSET_TABLES } = require('./it_asset_cleanup');
const { validateTableName } = require('./database');

// Preserve the established plant-reset lookup policy.
const PRESERVE = new Set([
    // Deletion triggers append audit events and HA tombstones here. These are
    // durable history/outbound replication, not operational rows to erase.
    // Clearing them either makes verification fail or silently drops deletes
    // that a secondary still needs to receive.
    'EventLog', 'sync_ledger',
    'schema_version', 'migration_history', 'WorkType', 'WorkStatuses', 'TaskTypes', 'WorkCode',
    'PurchaseStatuses', 'PartClasses', 'AdjustmentTypes', 'AssetTypes',
    'CostCenters', 'Shifts', 'Craft', 'LaborGrd', 'Reason', 'FailureCodeLibrary',
    'WorkObj', 'ProcObj', 'PartObj', 'ObjType', 'Object',
    'zAddOn', 'zAddrCst', 'zAllComp', 'zAppInfo', 'zCompanyVer',
    'zDatabaseObjectTypePermissions', 'zDatabaseObjectTypes', 'zDatabaseObjects',
    'zDatabaseObjectsGroups', 'zEntity', 'zErrLog', 'zForm', 'zGroups', 'zMessage',
    'zPPP', 'zPartCst', 'zPermissionTypes', 'zPrjStat', 'zReport', 'zReqNotify',
    'zReqStatus', 'zRptcls', 'zSchType', 'zUpHist', 'zUserCo', 'zUserGroups',
    'zUserPOStat', 'zUserWOStat',
]);

function withResetPlan(connection, logisticsDb, plantId, action) {
    connection.prepare('ATTACH DATABASE ? AS reset_logistics').run(logisticsDb.name);
    try {
        // Virtual-table shadow storage must be managed through its owning table.
        const local = connection.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type IN ('table', 'virtual')").all()
            .filter(row => !row.name.startsWith('sqlite_') && !PRESERVE.has(row.name))
            .map(row => ({ schema: 'main', table: validateTableName(row.name), where: '1 = 1', params: [] }));
        const shared = new Set(connection.prepare("SELECT name FROM reset_logistics.sqlite_master WHERE type = 'table'").all().map(row => row.name));
        const it = Object.keys(ASSET_TABLES).filter(category => shared.has(ASSET_TABLES[category]))
            .flatMap(category => assetCleanupPlan(category, plantId, null, 'reset_logistics'))
            .filter(entry => shared.has(entry.table));
        if (shared.has('it_vendors_contracts')) it.push({ schema: 'reset_logistics', table: 'it_vendors_contracts', where: 'PlantID = ?', params: [plantId] });
        return action([...it, ...local]);
    } finally {
        connection.exec('DETACH DATABASE reset_logistics');
    }
}

function countPlan(connection, plan) {
    const counts = {};
    for (const entry of plan) {
        const key = `${entry.schema === 'main' ? 'plant' : 'it'}.${entry.table}`;
        const n = connection.prepare(`SELECT COUNT(*) AS n FROM ${entry.schema}."${entry.table}" WHERE ${entry.where}`).get(...entry.params).n;
        counts[key] = (counts[key] || 0) + n;
    }
    // Installation links can match both the hardware and software owned by a site.
    // Count the union once, using link IDs rather than summing overlapping matches.
    const links = plan.filter(entry => entry.table === 'it_software_hardware_link' && entry.schema === 'reset_logistics');
    if (links.length) counts['it.it_software_hardware_link'] = connection.prepare(
        `SELECT COUNT(*) AS n FROM reset_logistics.it_software_hardware_link WHERE ${links.map(entry => `(${entry.where})`).join(' OR ')}`
    ).get(...links.flatMap(entry => entry.params)).n;
    return counts;
}

function executeReset(connection, plan, audit) {
    connection.exec('CREATE TEMP TABLE reset_it_targets (TableName TEXT, RowID INTEGER, PRIMARY KEY (TableName, RowID))');
    try { return connection.transaction(() => {
        // Defer checks so schema enumeration order cannot strand FK parents.
        // A preserved row referencing a removed row still rejects the commit.
        connection.pragma('defer_foreign_keys = ON');
        // Freeze shared row identities before deleting parents; otherwise a failed
        // child delete could disappear from a verification subquery's scope.
        for (const entry of plan.filter(entry => entry.schema === 'reset_logistics')) {
            connection.prepare(`INSERT OR IGNORE INTO temp.reset_it_targets SELECT ?, ID FROM reset_logistics."${entry.table}" WHERE ${entry.where}`)
                .run(entry.table, ...entry.params);
        }
        const sharedTables = [...new Set(plan.filter(entry => entry.schema === 'reset_logistics').map(entry => entry.table))];
        const frozen = [...sharedTables.map(table => ({ schema: 'reset_logistics', table,
            where: 'ID IN (SELECT RowID FROM temp.reset_it_targets WHERE TableName = ?)', params: [table] })),
            ...plan.filter(entry => entry.schema === 'main')];
        const before = countPlan(connection, frozen);
        for (const entry of frozen) {
            connection.prepare(`DELETE FROM ${entry.schema}."${entry.table}" WHERE ${entry.where}`).run(...entry.params);
        }
        const remaining = countPlan(connection, frozen);
        if (Object.values(remaining).some(n => n !== 0)) throw new Error('Reset verification failed: records remain in ' +
            Object.entries(remaining).filter(([, count]) => count !== 0).map(([table, count]) => `${table} (${count})`).join(', '));
        const totalRowsDeleted = Object.values(before).reduce((sum, n) => sum + n, 0);
        const result = { deleted: before, remaining, remainingRecords: 0, totalRowsDeleted,
            tablesWiped: Object.values(before).filter(n => n > 0).length };
        connection.prepare(`INSERT INTO reset_logistics.AuditLog (UserID, Action, PlantID, Details, Severity, IPAddress)
            VALUES (?, 'PLANT_RESET', ?, ?, 'CRITICAL', ?)`).run(audit.username, audit.plantId,
            JSON.stringify({ ...result, snapshotFile: audit.snapshotFile, logisticsSnapshotFile: audit.logisticsSnapshotFile, actorUserID: audit.userId }), audit.ip);
        return result;
    }).immediate(); }
    finally { connection.exec('DROP TABLE temp.reset_it_targets'); }
}

module.exports = { withResetPlan, countPlan, executeReset };
