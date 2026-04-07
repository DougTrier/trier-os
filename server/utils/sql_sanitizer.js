// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * SQL Sanitizer Utility
 * Defeats Mass Assignment SQL Injection vectors by actively 
 * pruning JSON payload keys against the authentic database schema.
 */

function filterValidColumns(db, tableName, payload) {
    if (!payload || typeof payload !== 'object') return {};
    
    // Force simple alphanumeric identifier format to prevent PRAGMA injection
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    
    try {
        // Retrieve physical table layout
        const columns = db.prepare(`PRAGMA table_info("${safeTable}")`).all();
        if (!columns || columns.length === 0) return {}; 
        
        const validNames = new Set(columns.map(c => c.name));
        const cleanPayload = {};
        
        for (const key of Object.keys(payload)) {
            // Only port over precisely matched column names
            if (validNames.has(key)) {
                cleanPayload[key] = payload[key];
            }
        }
        
        return cleanPayload;
    } catch (err) {
        console.error(`[SQL SANITIZER] Schema validation failed for ${safeTable}:`, err);
        return {};
    }
}

module.exports = { filterValidColumns };
