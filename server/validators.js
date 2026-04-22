// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Validator Module
 * =====================================
 * Central SQL injection prevention layer for the entire application.
 *
 * - whitelist(): Filters incoming request bodies to only allow known column names.
 *   This prevents mass-assignment attacks where an attacker adds extra fields.
 * - validateSort(): Validates ORDER BY columns against a strict whitelist.
 *   Added after the 2026 penetration test discovered ORDER BY injection vectors.
 * - Boolean values are automatically converted to 0/1 for SQLite compatibility.
 */

const whitelists = {
    work: [
        'ID', 'WorkOrderNumber', 'Description', 'AddDate', 'SchDate', 'StatusID',
        'AstID', 'Priority', 'AssignToID', 'Comment', 'ProcComment',
        'TechnicianID', 'TypeID', 'DeptID', 'LocationID',
        'Resolution', 'Userkey', 'UserID', 'OpenNotStarted', 'ExpectedDuration',
        'GPSAccuracy',
        'CompleteLng',
        'CompleteLat',
        'StartLng',
        'StartLat',
        'FailureMode',
        'WOSource', 'DowntimeCost', 'SchID',
        'CompDate', 'ReasonID'
    ],
    asset: [
        'ID', 'Description', 'AssetType', 'LocationID', 'DeptID', 'Serial',
        'Model', 'PurchaseDate', 'InstallDate', 'InstallCost', 'UsefulLife', 'Quantity',
        'RetirementDate', 'ReplacementCost', 'WarrantyID', 'WarrantyDate',
        'IsDeleted', 'DeleteReason', 'DeleteDate', 'Active', 'Manufacturer',
        'OperationalStatus',
        'SortOrder',
        'AssetLevel',
        'LocationPath',
        'ParentAssetID',
        'MeterLastUpdated',
        'MeterUnit',
        'MeterReading',
        'MeterType',
        'WarrantyStart',
        'WarrantyEnd',
        'WarrantyVendor',
        'WarrantyTerms',
        'PartNumber',
        'CriticalityClass',
        'CriticalityReason',
        'HourlyProductionValue',
        'CriticalityScoreSafety', 'CriticalityScoreEnv',
        'CriticalityScoreProd', 'CriticalityScoreProb',
        'CriticalityScoreTotal'
    ],
    part: [
        'ID', 'Description', 'PartClassID', 'Stock', 'OrdMin', 'UnitCost',
        'UOM', 'Location', 'VendorID', 'MinOrd', 'LeadTime', 'StandardCost',
        'OrdQtyID', 'Comment', 'VendorName', 'VendorAddr', 'VendorCity', 
        'VendorState', 'VendorZip', 'VendorPhone', 'VendorContact', 'VendorEmail',
        'VendorWebsite', 'Manufacturer', 'EnrichmentConflict'
    ],

    chatProfile: [
        'FirstName', 'LastName', 'Email', 'Phone', 'PlantId', 'Department', 'PasswordHash'
    ]
};

/**
 * Filter an object based on a whitelist of allowed keys
 */
function whitelist(obj, type) {
    if (!obj || typeof obj !== 'object') return {};
    const allowed = whitelists[type];
    if (!allowed) return {};

    const filtered = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // SQLite conversion: boolean -> integer
            if (typeof obj[key] === 'boolean') {
                filtered[key] = obj[key] ? 1 : 0;
            } else {
                filtered[key] = obj[key];
            }
        }
    }
    return filtered;
}

/**
 * Validates a sort column against a whitelist to prevent SQL injection
 */
function validateSort(column, type, defaultCol = 'ID') {
    if (!column) return defaultCol;
    const allowed = whitelists[type] || [];
    // Also allow rowid (ID_INTERNAL) and StatusLabel as they are used in joins/queries
    const extendedAllowed = [...allowed, 'rowid', 'ID_INTERNAL', 'StatusLabel', 'plantId', 'plantLabel'];
    if (extendedAllowed.includes(column)) return column;
    console.warn(`🛡️ Security: Blocked invalid sort column "${column}" for type "${type}"`);
    return defaultCol;
}

/**
 * Validates password complexity per OWASP guidelines.
 * Returns { valid: boolean, error: string|null }
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required.' };
    }
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one digit.' };
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character.' };
    }
    return { valid: true, error: null };
}

module.exports = {
    whitelist,
    whitelists,
    validateSort,
    validatePassword
};
