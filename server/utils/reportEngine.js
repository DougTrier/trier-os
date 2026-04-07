// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Report Generation Engine
 * ==================================================
 * Server-side report rendering engine that executes custom queries
 * defined by the Report Builder. Supports filtering, grouping,
 * aggregation, and export to CSV/JSON formats.
 */
/**
 * Dynamic Reporting Engine
 * Translates Universal Parameter Model into SQL
 */

const REPORT_TYPES = {
    ASSET: {
        id: 'ASSET',
        name: 'Asset and Equipment Summary',
        baseTable: 'Asset',
        joins: 'LEFT JOIN "CostCenters" ON "Asset"."CostID" = "CostCenters"."ID" LEFT JOIN "AssetTypes" ON "Asset"."AssetType" = "AssetTypes"."ID"',
        defaultCols: ['ID', 'Description', 'Model', 'Serial', 'LocationID', 'Building', 'Active'],
        dateField: null // Reference data, no default date filter
    },
    COST: {
        id: 'COST',
        name: 'Work Order Cost Summary',
        baseTable: 'Work',
        joins: 'LEFT JOIN "Asset" ON "Work"."AstID" = "Asset"."ID" LEFT JOIN "CostCenters" ON "Work"."CostID" = "CostCenters"."ID"',
        defaultCols: ['WorkOrderNumber', 'Description', 'AstID', 'CostID', 'AddDate'],
        computedCols: {
            'LaborCost': '(SELECT SUM(HrReg * PayReg + HrOver * PayOver) FROM WorkLabor WHERE WoID = Work.ID)',
            'PartsCost': '(SELECT SUM(ActQty * UnitCost) FROM WorkParts WHERE WoID = Work.ID)',
            'MiscCost': '(SELECT SUM(ActCost) FROM WorkMisc WHERE WoID = Work.ID)',
            'TotalCost': '(SELECT COALESCE(SUM(HrReg * PayReg + HrOver * PayOver),0) FROM WorkLabor WHERE WoID = Work.ID) + (SELECT COALESCE(SUM(ActQty * UnitCost),0) FROM WorkParts WHERE WoID = Work.ID) + (SELECT COALESCE(SUM(ActCost),0) FROM WorkMisc WHERE WoID = Work.ID)'
        },
        labels: { 'CostID': 'Cost Center', 'LaborCost': 'Labor ($)', 'PartsCost': 'Parts ($)', 'MiscCost': 'Misc ($)', 'TotalCost': 'Grand Total' },
        dateField: 'AddDate'
    },
    ASSET_BURN: {
        id: 'ASSET_BURN',
        name: 'Asset Burn Rate (Repair Spend)',
        baseTable: 'Asset',
        joins: 'LEFT JOIN "CostCenters" ON "Asset"."CostID" = "CostCenters"."ID"',
        defaultCols: ['ID', 'Description', 'CostID', 'LocationID'],
        computedCols: {
            'TotalWOs': '(SELECT COUNT(*) FROM Work WHERE AstID = Asset.ID)',
            'TotalSpend': '(SELECT COALESCE(SUM(C),0) FROM (SELECT (SELECT COALESCE(SUM(HrReg*PayReg + HrOver*PayOver),0) FROM WorkLabor WHERE WoID = W.ID) + (SELECT COALESCE(SUM(ActQty*UnitCost),0) FROM WorkParts WHERE WoID = W.ID) + (SELECT COALESCE(SUM(ActCost),0) FROM WorkMisc WHERE WoID = W.ID) as C FROM Work W WHERE W.AstID = Asset.ID))'
        },
        labels: { 'TotalWOs': 'WO Count', 'TotalSpend': 'Life-to-Date Spend' },
        dateField: null
    },
    INV_ISSUES: {
        id: 'INV_ISSUES',
        name: 'Monthly Inventory Consumption',
        baseTable: 'WorkParts',
        joins: 'LEFT JOIN "Part" ON "WorkParts"."PartID" = "Part"."ID" LEFT JOIN "Work" ON "WorkParts"."WoID" = "Work"."ID"',
        defaultCols: ['PartID', 'UseDate', 'ActQty', 'UnitCost'],
        computedCols: {
            'Month': "strftime('%Y-%m', \"WorkParts\".\"UseDate\")",
            'PartName': '"Part"."Description"',
            'LineTotal': 'CAST("WorkParts"."ActQty" AS REAL) * CAST("WorkParts"."UnitCost" AS REAL)'
        },
        labels: { 'Month': 'Period', 'PartName': 'Part Description', 'LineTotal': 'Extended Cost' },
        dateField: 'UseDate'
    },
    DOWNTIME: {
        id: 'DOWNTIME',
        name: 'Downtime & Reliability',
        baseTable: 'Work',
        joins: 'LEFT JOIN "Asset" ON "Work"."AstID" = "Asset"."ID"',
        filter: '("Work"."ActDown" > 0 OR "Work"."EstDown" > 0)',
        sortField: 'AddDate',
        defaultCols: ['WorkOrderNumber', 'AstID', 'Description', 'ActDown', 'AddDate'],
        dateField: 'AddDate'
    },
    WORKORDER: {
        id: 'WORKORDER',
        name: 'Work Order Summary',
        baseTable: 'Work',
        joins: 'LEFT JOIN "WorkType" ON "Work"."TypeID" = "WorkType"."ID"', 
        defaultCols: ['WorkOrderNumber', 'Description', 'StatusID', 'TypeID', 'Priority', 'AddDate'],
        labels: { 'TypeID': 'WO Type' },
        dateField: 'AddDate'
    },
    INVENTORY: {
        id: 'INVENTORY',
        name: 'Inventory & Warehouse',
        baseTable: 'Part',
        defaultCols: ['ID', 'Description', 'Stock', 'UnitCost', 'Location'],
        dateField: null // Reference data
    },
    FORECAST: {
        id: 'FORECAST',
        name: 'Forecast & Planning',
        baseTable: 'Schedule',
        defaultCols: ['ID', 'Description', 'LastSch', 'LastComp'],
        dateField: null  // LastSch is reference data, not time-series — no date filter
    },
    SECURITY: {
        id: 'SECURITY',
        name: 'Security & Audit',
        baseTable: 'AuditLog',
        sortField: 'ActDate',
        defaultCols: ['ActDate', 'UserID', 'Description', 'Comment'],
        dateField: 'ActDate'
    },
    WOFMT: {
        id: 'WOFMT',
        name: 'Work Order Output',
        baseTable: 'Work',
        defaultCols: ['WorkOrderNumber', 'Description'],
        dateField: 'AddDate'
    },
    CALENDAR: {
        id: 'CALENDAR',
        name: 'Schedule & Calendar',
        baseTable: 'Calendar',
        sortField: 'CalDate',
        defaultCols: ['CalDate', 'Comment'],
        dateField: 'CalDate'
    },
    PURCHASING: {
        id: 'PURCHASING',
        name: 'Vendor & Purchasing',
        baseTable: 'PO',
        defaultCols: ['ID', 'PONumber', 'VendorID', 'StatusID', 'AddDate'],
        dateField: 'AddDate'
    },
    PROJECT: {
        id: 'PROJECT',
        name: 'Project & Capital',
        baseTable: 'Project',
        defaultCols: ['ID', 'Description', 'StatusID', 'ActLbrCst', 'ActPrtCst', 'ActMisCst'],
        dateField: 'ActStart'
    },
    LABOR: {
        id: 'LABOR',
        name: 'Time and Labor Summary',
        baseTable: 'LaborTime',
        sortField: 'DateRef',
        defaultCols: ['AddrID', 'Hrs', 'DateRef', 'Comment'],
        dateField: 'DateRef'
    }
};

function buildQuery(typeId, params = {}) {
    const rpt = REPORT_TYPES[typeId];
    if (!rpt) throw new Error('Invalid report type: ' + typeId);

    const bTable = `"${rpt.baseTable}"`;

    // Use explicit column list with table aliases to avoid collisions
    const baseCols = rpt.defaultCols.map(c => `${bTable}."${c}" AS "${c}"`);
    const virtualCols = rpt.computedCols ? Object.entries(rpt.computedCols).map(([alias, sql]) => `${sql} AS "${alias}"`) : [];
    const cols = [...baseCols, ...virtualCols].join(', ');
    
    let sql = `SELECT ${cols} FROM ${bTable} ${rpt.joins || ''}`;
    const where = [];
    const values = [];

    // Legacy data filter - hide records where no actual costs were recorded
    if (params.hideLegacy && rpt.computedCols?.TotalCost) {
        where.push(`(${rpt.computedCols.TotalCost}) > 0`);
    } else if (params.hideLegacy && rpt.computedCols?.TotalSpend) {
        where.push(`(${rpt.computedCols.TotalSpend}) > 0`);
    }

    // Base filter
    if (rpt.filter) where.push(rpt.filter);

    // Dynamic filters
    if (params.filters) {
        Object.entries(params.filters).forEach(([key, val]) => {
            if (val === null || val === undefined || val === '' || val === true) return; 
            if (Array.isArray(val)) {
                where.push(`${bTable}."${key}" IN (${val.map(() => '?').join(',')})`);
                values.push(...val);
            } else {
                where.push(`${bTable}."${key}" = ?`);
                values.push(val);
            }
        });
    }

    // Date range - Only apply if field is provided AND it's not a reference/master data table
    const dateField = params.dateField || rpt.dateField;
    if (params.dateRange && dateField) {
        if (params.dateRange.start) {
            where.push(`${bTable}."${dateField}" >= ?`);
            values.push(params.dateRange.start);
        }
        if (params.dateRange.end) {
            where.push(`${bTable}."${dateField}" <= ?`);
            values.push(params.dateRange.end);
        }
    }

    if (where.length > 0) {
        sql += ` WHERE ${where.join(' AND ')}`;
    }

    // Grouping / Sorting
    const defaultSortField = rpt.sortField || (rpt.defaultCols.includes('ID') ? 'ID' : rpt.defaultCols[0]);

    if (params.group) {
        sql += ` ORDER BY ${bTable}."${params.group}"`;
    } else if (params.sort && params.sort.field && (params.sort.field !== 'ID' || rpt.defaultCols.includes('ID'))) {
        sql += ` ORDER BY ${bTable}."${params.sort.field}" ${params.sort.direction || 'ASC'}`;
    } else {
        sql += ` ORDER BY ${bTable}."${defaultSortField}" DESC`;
    }

    // Pagination
    if (params.pagination) {
        sql += ` LIMIT ? OFFSET ?`;
        values.push(params.pagination.limit || 100);
        values.push((params.pagination.page - 1) * (params.pagination.limit || 100));
    } else {
        sql += ` LIMIT 1000`;
    }

    return { sql, values, config: rpt };
}

module.exports = {
    REPORT_TYPES,
    buildQuery
};
