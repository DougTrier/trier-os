�# Trier OS � Production Build Script (Clean Databases)
# Creates a deployable build with empty plant databases + preserved catalogs
# ======================================================================
$ErrorActionPreference = "Continue"

$SOURCE   = "G:\Trier OS"
$BUILD    = $args[0]
if (-not $BUILD) { $BUILD = "G:\TrierOS-v3.4.3-production" }
$NODE_EXE = (Get-Command node).Source

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Trier OS - Production Build (Clean)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Source:  $SOURCE"
Write-Host "  Output:  $BUILD"
Write-Host ""

# Step 1: Clean
Write-Host "[1/8] Preparing build directory..." -ForegroundColor Yellow
if (Test-Path $BUILD) { Remove-Item -Path $BUILD -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -Path $BUILD -ItemType Directory -Force | Out-Null
Write-Host "  OK" -ForegroundColor Green

# Step 2: Build frontend
Write-Host "[2/8] Building production frontend..." -ForegroundColor Yellow
Set-Location $SOURCE
& npx vite build 2>&1 | Select-String "built in" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK" -ForegroundColor Green

# Step 2b: Bundle Monaco editor (self-hosted, no CDN, works air-gapped)
Write-Host "[2b/8] Bundling Monaco editor..." -ForegroundColor Yellow
$monacoSrc = "$SOURCE\node_modules\monaco-editor\min\vs"
$monacoDst = "$SOURCE\dist\monaco-vs"
if (Test-Path $monacoSrc) {
    robocopy $monacoSrc $monacoDst /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    Write-Host "  Monaco bundled into dist/monaco-vs/" -ForegroundColor Green
} else {
    Write-Host "  WARNING: monaco-editor not found — skipping" -ForegroundColor Yellow
}

# Step 3: Copy app files (EXCLUDE keygen.js � private tool)
Write-Host "[3/8] Copying application files..." -ForegroundColor Yellow
robocopy "$SOURCE\server" "$BUILD\server" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "  server/"
robocopy "$SOURCE\dist" "$BUILD\dist" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "  dist/"
robocopy "$SOURCE\public" "$BUILD\public" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "  public/"
if (Test-Path "$SOURCE\enrichment") {
    robocopy "$SOURCE\enrichment" "$BUILD\enrichment" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    Write-Host "  enrichment/"
}
if (Test-Path "$SOURCE\eng.traineddata") {
    Copy-Item "$SOURCE\eng.traineddata" "$BUILD\" -Force
    Write-Host "  eng.traineddata"
}
Copy-Item "$SOURCE\package.json" "$BUILD\" -Force
Copy-Item "$SOURCE\package-lock.json" "$BUILD\" -Force
Copy-Item "$SOURCE\.env" "$BUILD\" -Force
Copy-Item "$SOURCE\index.html" "$BUILD\" -Force
Copy-Item "$SOURCE\vite.config.js" "$BUILD\" -Force
# NOTE: keygen.js is NOT copied � it stays on Doug's machine only
Write-Host "  config files (keygen.js excluded)"
Write-Host "  OK" -ForegroundColor Green

# Step 4: Copy PRESERVED databases (catalogs, template)
Write-Host "[4/8] Copying preserved databases..." -ForegroundColor Yellow
New-Item -Path "$BUILD\data" -ItemType Directory -Force | Out-Null
New-Item -Path "$BUILD\snapshots" -ItemType Directory -Force | Out-Null

# These databases are copied AS-IS (not cleared)
$preservedDbs = @(
    "MFG_master.db",          # Master MFG Equipment & Parts Catalog
    "it_master.db",             # IT Hardware/Software Catalog
    "schema_template.db"        # Empty template for new plant creation
)
foreach ($db in $preservedDbs) {
    if (Test-Path "$SOURCE\data\$db") {
        Copy-Item "$SOURCE\data\$db" "$BUILD\data\" -Force
        Write-Host "  PRESERVED: $db" -ForegroundColor Cyan
    }
}
Write-Host "  OK" -ForegroundColor Green

# Step 5: Create clean system databases + empty plant DBs
Write-Host "[5/8] Creating clean databases..." -ForegroundColor Yellow

# Write the cleaner script
$cleanerScript = @'
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SOURCE_DATA = process.argv[2];
const BUILD_DATA  = process.argv[3];

// ���� 1. Clean trier_auth.db (keep schema, clear users except Creator) ����
console.log('  Creating clean trier_auth.db...');
const srcAuth = new Database(path.join(SOURCE_DATA, 'trier_auth.db'), { readonly: true });
const dstAuth = new Database(path.join(BUILD_DATA, 'trier_auth.db'));
// Copy schema
const authSchema = srcAuth.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").all();
authSchema.forEach(row => { try { dstAuth.exec(row.sql); } catch(e) {} });
// Insert Creator account only (Doug Trier)
const creator = srcAuth.prepare("SELECT * FROM Users WHERE Username = 'Doug Trier'").get();
if (creator) {
    const cols = Object.keys(creator).join(', ');
    const placeholders = Object.keys(creator).map(() => '?').join(', ');
    dstAuth.prepare(`INSERT INTO Users (${cols}) VALUES (${placeholders})`).run(...Object.values(creator));
    // Add Creator's plant roles
    const roles = srcAuth.prepare("SELECT * FROM UserPlantRoles WHERE UserID = ?").all(creator.ID);
    roles.forEach(r => {
        try { dstAuth.prepare("INSERT INTO UserPlantRoles (UserID, PlantID, RoleLevel) VALUES (?, ?, ?)").run(r.UserID, r.PlantID, r.RoleLevel); } catch(e) {}
    });
    console.log('    Creator account preserved (Doug Trier)');
}
// Copy ldap_config schema
try { 
    const ldapRows = srcAuth.prepare("SELECT sql FROM sqlite_master WHERE name='ldap_config'").all();
    ldapRows.forEach(r => { try { dstAuth.exec(r.sql); } catch(e) {} });
} catch(e) {}
srcAuth.close();
dstAuth.close();

// ���� 2. Clean trier_logistics.db (keep schema + preserved tables, clear data) ����
console.log('  Creating clean trier_logistics.db...');
const srcLog = new Database(path.join(SOURCE_DATA, 'trier_logistics.db'), { readonly: true });
const dstLog = new Database(path.join(BUILD_DATA, 'trier_logistics.db'));
dstLog.pragma('journal_mode = WAL');

// Copy all table schemas
const logSchema = srcLog.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL").all();
logSchema.forEach(row => { try { dstLog.exec(row.sql); } catch(e) {} });

// Copy certain config tables that should persist
const preservedLogTables = [
    'SystemSettings', 'EscalationRules', 'compliance_frameworks',
    'approval_settings', 'creator_settings', 'sensor_config'
];
preservedLogTables.forEach(table => {
    try {
        const rows = srcLog.prepare(`SELECT * FROM "${table}"`).all();
        if (rows.length > 0) {
            const cols = Object.keys(rows[0]).join(', ');
            const placeholders = Object.keys(rows[0]).map(() => '?').join(', ');
            const stmt = dstLog.prepare(`INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`);
            rows.forEach(r => { try { stmt.run(...Object.values(r)); } catch(e) {} });
            console.log(`    Preserved: ${table} (${rows.length} rows)`);
        }
    } catch(e) {}
});
srcLog.close();
dstLog.close();

// ���� 3. Clean corporate_master.db (keep schema + CostCenters) ����
console.log('  Creating clean corporate_master.db...');
const srcCorp = new Database(path.join(SOURCE_DATA, 'corporate_master.db'), { readonly: true });
const dstCorp = new Database(path.join(BUILD_DATA, 'corporate_master.db'));
const corpSchema = srcCorp.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL").all();
corpSchema.forEach(row => { try { dstCorp.exec(row.sql); } catch(e) {} });
// Copy CostCenters (structural data)
try {
    const cc = srcCorp.prepare("SELECT * FROM CostCenters").all();
    if (cc.length > 0) {
        const cols = Object.keys(cc[0]).join(', ');
        const ph = Object.keys(cc[0]).map(() => '?').join(', ');
        const stmt = dstCorp.prepare(`INSERT INTO CostCenters (${cols}) VALUES (${ph})`);
        cc.forEach(r => stmt.run(...Object.values(r)));
        console.log(`    Preserved: CostCenters (${cc.length} rows)`);
    }
} catch(e) {}
srcCorp.close();
dstCorp.close();

// ���� 4. Create empty plant databases from schema_template ����
console.log('  Creating empty plant databases from template...');
// Get list of all plant DBs (not system DBs)
const systemDbs = ['MFG_master.db', 'it_master.db', 'schema_template.db', 'trier_auth.db',
    'trier_logistics.db', 'trier_chat.db', 'corporate_master.db', 'logistics.db',
    'TrierOS_Platform.db'];
const allDbs = fs.readdirSync(SOURCE_DATA).filter(f => f.endsWith('.db') && !systemDbs.includes(f));
const templatePath = path.join(BUILD_DATA, 'schema_template.db');

let plantCount = 0;
allDbs.forEach(dbFile => {
    const destPath = path.join(BUILD_DATA, dbFile);
    // Copy the template as the new empty plant DB
    fs.copyFileSync(templatePath, destPath);
    
    // Clear any template seed data (keep structural: AssetTypes, PartClasses, WorkType, failure_modes, schema_version)
    const db = new Database(destPath);
    const dataTables = ['Asset', 'AssetParts', 'Part', 'Work', 'WorkLabor', 'WorkMisc', 'WorkParts',
        'LaborTime', 'PO', 'Schedule', 'Procedures', 'ProcedureTasks', 'ProcedureParts',
        'Task', 'Project', 'SiteLeadership', 'Calendar', 'CostCenters', 'AuditLog',
        'MeterReadings', 'Vendors', 'calendar_reminders', 'record_locks', 'sync_ledger',
        'tribal_knowledge', 'ChatProfile', 'Locations'];
    dataTables.forEach(t => {
        try { db.exec(`DELETE FROM "${t}"`); } catch(e) {}
    });
    db.close();
    plantCount++;
});
console.log(`    Created ${plantCount} empty plant databases`);

// ���� 5. Create empty chat + misc DBs ����
['trier_chat.db', 'TrierOS_Platform.db', 'logistics.db'].forEach(f => {
    try {
        if (fs.existsSync(path.join(SOURCE_DATA, f))) {
            const src = new Database(path.join(SOURCE_DATA, f), { readonly: true });
            const dst = new Database(path.join(BUILD_DATA, f));
            const schema = src.prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL").all();
            schema.forEach(row => { try { dst.exec(row.sql); } catch(e) {} });
            src.close();
            dst.close();
            console.log(`    Created empty: ${f}`);
        }
    } catch(e) { console.log(`    Skipped: ${f} (${e.message})`); }
});

console.log('  Database cleaning complete!');
'@

$cleanerPath = Join-Path $SOURCE "_clean_databases.js"
$cleanerScript | Set-Content -Path $cleanerPath -Encoding UTF8

# Run the cleaner from the SOURCE directory where better-sqlite3 is already installed
Set-Location $SOURCE
& node $cleanerPath "$SOURCE\data" "$BUILD\data" 2>&1 | ForEach-Object { Write-Host "  $_" }
Set-Location $BUILD


# Remove the temp cleaner script
Remove-Item $cleanerPath -Force -ErrorAction SilentlyContinue

Write-Host "  OK" -ForegroundColor Green

# Step 6: Install production deps
Write-Host "[6/8] Installing production dependencies..." -ForegroundColor Yellow
Set-Location $BUILD
& npm install --production --ignore-scripts 2>&1 | Select-String "added" | ForEach-Object { Write-Host "  $_" }
Write-Host "  Rebuilding native modules..."
& npm rebuild better-sqlite3 2>&1 | Select-String "better-sqlite3" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK" -ForegroundColor Green

# Step 7: Bundle Node.js
Write-Host "[7/8] Bundling Node.js runtime..." -ForegroundColor Yellow
New-Item -Path "$BUILD\runtime" -ItemType Directory -Force | Out-Null
Copy-Item $NODE_EXE "$BUILD\runtime\node.exe" -Force
$nodeVer = & "$BUILD\runtime\node.exe" -v
Write-Host "  Bundled node.exe $nodeVer" -ForegroundColor Cyan
Write-Host "  OK" -ForegroundColor Green

# Step 8: Create launcher
Write-Host "[8/8] Creating launcher..." -ForegroundColor Yellow

$batContent = @'
@echo off
title Trier OS - Trier OS
echo.
echo  ================================================================
echo   Trier OS - Enterprise Maintenance Management System
echo   (c) 2026 Doug Trier. All Rights Reserved.
echo  ================================================================
echo.
echo  Starting server...
echo.
cd /d "%~dp0"
set NODE_ENV=production
runtime\node.exe server\index.js
echo.
echo  Server stopped. Press any key to exit.
pause > nul
'@
$batContent | Set-Content -Path (Join-Path $BUILD "Trier OS.bat") -Encoding ASCII

Write-Host "  Trier OS.bat created" -ForegroundColor Cyan
Write-Host "  OK" -ForegroundColor Green

# Summary
$totalSize = [math]::Round((Get-ChildItem $BUILD -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1048576, 0)
$fileCount = (Get-ChildItem $BUILD -Recurse -File).Count
$dbCount = @(Get-ChildItem "$BUILD\data\*.db" -ErrorAction SilentlyContinue).Count

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  PRODUCTION BUILD COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Location:   $BUILD"
Write-Host "  Total Size: $totalSize MB"
Write-Host "  Files:      $fileCount"
Write-Host "  Databases:  $dbCount (all cleaned)"
Write-Host "  Node.js:    $nodeVer (bundled)"
Write-Host ""
Write-Host "  PRESERVED (not cleared):" -ForegroundColor Cyan
Write-Host "    - MFG_master.db     (Master MFG Catalog)"
Write-Host "    - it_master.db        (IT Equipment Catalog)"
Write-Host "    - schema_template.db  (New plant template)"
Write-Host "    - Language files      (built into frontend)"
Write-Host ""
Write-Host "  CLEANED:" -ForegroundColor Yellow
Write-Host "    - All plant databases (empty schema only)"
Write-Host "    - trier_auth.db     (Creator account only)"
Write-Host "    - trier_logistics.db (schema + config only)"
Write-Host "    - corporate_master.db (schema + CostCenters)"
Write-Host ""
Write-Host "  EXCLUDED:" -ForegroundColor Red
Write-Host "    - keygen.js (stays on Doug's machine)"
Write-Host ""
Write-Host "  Requires activation key (keygen.js on your machine)" -ForegroundColor Yellow
Write-Host "  Creator (Doug Trier) can log in without activation" -ForegroundColor Yellow
Write-Host ""
