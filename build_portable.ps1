�# Trier OS � Portable Demo Build Script (Full Data)
$ErrorActionPreference = "Continue"

$SOURCE   = "G:\Trier OS"
$BUILD    = $args[0]
if (-not $BUILD) { $BUILD = "G:\TrierOS-v3.3.0-Demo" }
$NODE_EXE = (Get-Command node).Source

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Trier OS - Portable Demo Build" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Source:  $SOURCE"
Write-Host "  Output:  $BUILD"
Write-Host ""

# Step 1: Clean
Write-Host "[1/7] Preparing build directory..." -ForegroundColor Yellow
if (Test-Path $BUILD) { Remove-Item -Path $BUILD -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -Path $BUILD -ItemType Directory -Force | Out-Null
Write-Host "  OK" -ForegroundColor Green

# Step 2: Build frontend
Write-Host "[2/7] Building production frontend..." -ForegroundColor Yellow
Set-Location $SOURCE
& npx vite build 2>&1 | Select-String "built in" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK" -ForegroundColor Green

# Step 3: Copy app files
Write-Host "[3/7] Copying application files..." -ForegroundColor Yellow
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
Write-Host "  config files"
Write-Host "  OK" -ForegroundColor Green

# Step 4: Copy ALL databases with full data
Write-Host "[4/7] Copying databases (FULL DATA)..." -ForegroundColor Yellow
robocopy "$SOURCE\data" "$BUILD\data" /MIR /NFL /NDL /NJH /NJS /NC /NS /XF "*.db-shm" "*.db-wal" "*.IMPORT_SNAP_*" "*.RESET_SNAP_*" | Out-Null

# Verify DBs are not empty
$dbCount = @(Get-ChildItem "$BUILD\data\*.db" -ErrorAction SilentlyContinue).Count
Write-Host "  $dbCount databases copied" -ForegroundColor Cyan

# Verify a sample plant DB has data
$sampleDb = Get-ChildItem "$BUILD\data\Demo_Plant_1.db" -ErrorAction SilentlyContinue
if ($sampleDb -and $sampleDb.Length -gt 100000) {
    Write-Host "  Verified: Demo_Plant_1.db has data ($([math]::Round($sampleDb.Length/1024))KB)" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Demo_Plant_1.db may be empty!" -ForegroundColor Red
}

# Verify JSON configs are present
$jsonFiles = @("plants.json", "branding.json", "corporate_leadership.json")
foreach ($jf in $jsonFiles) {
    if (Test-Path "$BUILD\data\$jf") {
        Write-Host "  Config: $jf OK" -ForegroundColor Green
    } else {
        Write-Host "  MISSING: $jf" -ForegroundColor Red
    }
}

# Copy secondary data if exists
if (Test-Path "$SOURCE\data_secondary") {
    robocopy "$SOURCE\data_secondary" "$BUILD\data_secondary" /MIR /NFL /NDL /NJH /NJS /NC /NS /XF "*.db-shm" "*.db-wal" | Out-Null
    Write-Host "  data_secondary/"
}
New-Item -Path "$BUILD\snapshots" -ItemType Directory -Force | Out-Null
Write-Host "  OK" -ForegroundColor Green

# Step 5: Install production deps
Write-Host "[5/7] Installing production dependencies..." -ForegroundColor Yellow
Set-Location $BUILD
& npm install --production --ignore-scripts 2>&1 | Select-String "added" | ForEach-Object { Write-Host "  $_" }
Write-Host "  Rebuilding native modules..."
& npm rebuild better-sqlite3 2>&1 | Select-String "better-sqlite3" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK" -ForegroundColor Green

# Step 6: Bundle Node.js
Write-Host "[6/7] Bundling Node.js runtime..." -ForegroundColor Yellow
New-Item -Path "$BUILD\runtime" -ItemType Directory -Force | Out-Null
Copy-Item $NODE_EXE "$BUILD\runtime\node.exe" -Force
$nodeVer = & "$BUILD\runtime\node.exe" -v
Write-Host "  Bundled node.exe $nodeVer" -ForegroundColor Cyan
Write-Host "  OK" -ForegroundColor Green

# Step 7: Create launchers
Write-Host "[7/7] Creating launchers..." -ForegroundColor Yellow

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

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  DEMO BUILD COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Location:   $BUILD"
Write-Host "  Total Size: $totalSize MB"
Write-Host "  Files:      $fileCount"
Write-Host "  Databases:  $dbCount (FULL DATA)"
Write-Host "  Node.js:    $nodeVer (bundled)"
Write-Host "  QR Codes:   Local generation (no internet required)"
Write-Host ""
Write-Host "  To run on any Windows PC:" -ForegroundColor Yellow
Write-Host "    1. Copy this folder to target machine" -ForegroundColor White
Write-Host "    2. Double-click 'Trier OS.bat'" -ForegroundColor White
Write-Host "    3. Open browser to the HTTPS URL shown" -ForegroundColor White
Write-Host ""
