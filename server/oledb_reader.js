// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - OLE DB / Access Database Reader
 * ===================================================
 * Reads legacy Microsoft Access (.mdb/.accdb) databases using the OLEDB
 * provider chain. Used by the Trier Data Bridge import engine to extract
 * tables from MP2/Tabware/Access-based Enterprise System systems.
 *
 * DEPENDENCIES: Requires Windows with Microsoft Access Database Engine.
 * Falls back to mdbtools on Linux (untested in production).
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OLEDB Access Database Reader
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Fallback reader for .accdb (Access 2007+) files that mdb-reader can't handle.
 * Uses PowerShell + System.Data.OleDb on Windows with Microsoft ACE OLEDB driver.
 * 
 * Flow: mdb-reader (fast, in-process) → OLEDB fallback (slower, out-of-process)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Check if OLEDB driver is available on this system
 */
function isOledbAvailable() {
    if (os.platform() !== 'win32') return false;
    try {
        const result = execSync(
            'powershell -Command "try { New-Object System.Data.OleDb.OleDbConnection | Out-Null; Write-Output OK } catch { Write-Output FAIL }"',
            { encoding: 'utf8', timeout: 5000 }
        ).trim();
        return result === 'OK';
    } catch (e) {
        return false;
    }
}

/**
 * Build OLEDB connection string for an Access database
 */
function buildConnectionString(filePath, password = null) {
    let connStr = `Provider=Microsoft.ACE.OLEDB.12.0;Data Source=${filePath};`;
    if (password) {
        connStr += `Jet OLEDB:Database Password=${password};`;
    }
    return connStr;
}

/**
 * Execute a PowerShell script that interacts with an Access DB via OLEDB.
 * Returns parsed JSON output from the script.
 */
function runOledbScript(scriptContent, timeout = 30000) {
    // Write script to temp file to avoid escaping issues
    const tmpFile = path.join(os.tmpdir(), `trier_oledb_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, scriptContent, 'utf8');
    
    try {
        const result = execSync(
            `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`,
            { encoding: 'utf8', timeout, maxBuffer: 50 * 1024 * 1024 }
        );
        return result.trim();
    } finally {
        try { fs.unlinkSync(tmpFile); } catch (e) { /* cleanup */ }
    }
}

/**
 * Open an Access database and list all user tables with column names.
 * Tries each password until one works.
 * 
 * @param {string} filePath - Path to .accdb file
 * @param {string[]} passwords - Array of passwords to try
 * @returns {{ tables: Array<{name, columns, columnCount}>, usedPassword: string|null }}
 */
function listTables(filePath, passwords = []) {
    const allPasswords = ['', ...passwords]; // Try no password first
    
    const script = `
$filePath = '${filePath.replace(/'/g, "''")}'
$passwords = @(${allPasswords.map(p => `'${p.replace(/'/g, "''")}'`).join(',')})
$result = @{ success = $false; error = ""; tables = @(); usedPassword = "" }

foreach ($pwd in $passwords) {
    try {
        $pwdPart = if ($pwd) { "Jet OLEDB:Database Password=$pwd;" } else { "" }
        $connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$filePath;$pwdPart"
        
        $conn = New-Object System.Data.OleDb.OleDbConnection
        $conn.ConnectionString = $connStr
        $conn.Open()
        
        $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, @($null, $null, $null, "TABLE"))
        $tables = @()
        
        foreach ($row in $schema.Rows) {
            $tblName = $row.TABLE_NAME
            try {
                $cmd = $conn.CreateCommand()
                $cmd.CommandText = "SELECT TOP 1 * FROM [$tblName]"
                $reader = $cmd.ExecuteReader()
                $cols = @()
                for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                    $cols += $reader.GetName($i)
                }
                $reader.Close()
                $tables += @{ name = $tblName; columns = $cols; columnCount = $cols.Count }
            } catch {
                $tables += @{ name = $tblName; columns = @(); columnCount = 0 }
            }
        }
        
        $conn.Close()
        $result.success = $true
        $result.tables = $tables
        $result.usedPassword = $pwd
        break
    } catch {
        continue
    }
}

if (-not $result.success) { $result.error = "Could not open database with any password" }
$result | ConvertTo-Json -Depth 4 -Compress
`;

    const output = runOledbScript(script);
    return JSON.parse(output);
}

/**
 * Read all rows from a specific table in an Access database.
 * 
 * @param {string} filePath - Path to .accdb file  
 * @param {string} tableName - Table to read
 * @param {string} password - Password (already known from listTables)
 * @returns {{ columns: string[], rows: object[] }}
 */
function readTable(filePath, tableName, password = '') {
    const script = `
$filePath = '${filePath.replace(/'/g, "''")}'
$tableName = '${tableName.replace(/'/g, "''")}'
$pwd = '${(password || '').replace(/'/g, "''")}'

$pwdPart = if ($pwd) { "Jet OLEDB:Database Password=$pwd;" } else { "" }
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$filePath;$pwdPart"

try {
    $conn = New-Object System.Data.OleDb.OleDbConnection
    $conn.ConnectionString = $connStr
    $conn.Open()
    
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT * FROM [$tableName]"
    $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
    $dataTable = New-Object System.Data.DataTable
    [void]$adapter.Fill($dataTable)
    
    $columns = @()
    foreach ($col in $dataTable.Columns) { $columns += $col.ColumnName }
    
    $rows = @()
    foreach ($row in $dataTable.Rows) {
        $obj = @{}
        foreach ($col in $columns) {
            $val = $row[$col]
            if ($val -is [DBNull]) { $obj[$col] = $null }
            elseif ($val -is [DateTime]) { $obj[$col] = $val.ToString("yyyy-MM-ddTHH:mm:ss") }
            else { $obj[$col] = [string]$val }
        }
        $rows += $obj
    }
    
    $conn.Close()
    @{ success = $true; columns = $columns; rows = $rows; rowCount = $rows.Count } | ConvertTo-Json -Depth 3 -Compress
} catch {
    @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

    const output = runOledbScript(script, 60000); // 60 sec timeout for large tables
    return JSON.parse(output);
}

/**
 * Read multiple tables at once (more efficient than one-by-one).
 * Returns a Map of tableName → { columns, rows }.
 * 
 * @param {string} filePath
 * @param {string[]} tableNames 
 * @param {string} password
 * @returns {Map<string, {columns: string[], rows: object[]}>}
 */
function readMultipleTables(filePath, tableNames, password = '') {
    const tableListPs = tableNames.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
    
    const script = `
$filePath = '${filePath.replace(/'/g, "''")}'
$tableNames = @(${tableListPs})
$pwd = '${(password || '').replace(/'/g, "''")}'

$pwdPart = if ($pwd) { "Jet OLEDB:Database Password=$pwd;" } else { "" }
$connStr = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$filePath;$pwdPart"

$results = @{}

try {
    $conn = New-Object System.Data.OleDb.OleDbConnection
    $conn.ConnectionString = $connStr
    $conn.Open()
    
    foreach ($tbl in $tableNames) {
        try {
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = "SELECT * FROM [$tbl]"
            $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
            $dataTable = New-Object System.Data.DataTable
            [void]$adapter.Fill($dataTable)
            
            $columns = @()
            foreach ($col in $dataTable.Columns) { $columns += $col.ColumnName }
            
            $rows = @()
            foreach ($row in $dataTable.Rows) {
                $obj = @{}
                foreach ($col in $columns) {
                    $val = $row[$col]
                    if ($val -is [DBNull]) { $obj[$col] = $null }
                    elseif ($val -is [DateTime]) { $obj[$col] = $val.ToString("yyyy-MM-ddTHH:mm:ss") }
                    else { $obj[$col] = [string]$val }
                }
                $rows += $obj
            }
            
            $results[$tbl] = @{ success = $true; columns = $columns; rows = $rows; rowCount = $rows.Count }
        } catch {
            $results[$tbl] = @{ success = $false; error = $_.Exception.Message; columns = @(); rows = @() }
        }
    }
    
    $conn.Close()
    @{ success = $true; tables = $results } | ConvertTo-Json -Depth 4 -Compress
} catch {
    @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

    const output = runOledbScript(script, 120000); // 2 min timeout
    return JSON.parse(output);
}

module.exports = {
    isOledbAvailable,
    listTables,
    readTable,
    readMultipleTables,
    buildConnectionString
};
