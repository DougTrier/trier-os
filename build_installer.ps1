# Trier OS - Installer Build Script
# ======================================================================
# Must be run as Administrator (required for symlink creation during
# electron-builder's winCodeSign extraction)
#
# Usage: Run as Admin in PowerShell:
#   powershell -ExecutionPolicy Bypass -File build_installer.ps1
# ======================================================================
$ErrorActionPreference = "Continue"

$SOURCE_DIR   = "G:\Trier OS"
$BUILD_DIR    = "C:\TrierOSBuild"
$OUTPUT_DIR   = "C:\Trier OS"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Trier OS - Installer Build Script" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 1: Clean and copy project --
Write-Host "[1/5] Preparing build directory..." -ForegroundColor Yellow

if (Test-Path $BUILD_DIR) {
    Write-Host "  Cleaning previous build at $BUILD_DIR..."
    Remove-Item -Path $BUILD_DIR -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "  Copying project to $BUILD_DIR..."
robocopy $SOURCE_DIR $BUILD_DIR /MIR /NFL /NDL /NJH /NJS /NC /NS /XD "node_modules" ".git" "electron-dist" "__pycache__" ".gemini" /XF "*.db-shm" "*.db-wal" "snapshot_backup_*" | Out-Null
Write-Host "  OK - Project copied." -ForegroundColor Green

# -- Step 2: Install ALL dependencies --
Write-Host ""
Write-Host "[2/5] Installing all dependencies..." -ForegroundColor Yellow

Set-Location $BUILD_DIR
& cmd /c "npm install 2>&1" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK - All dependencies installed." -ForegroundColor Green

# -- Step 3: Build frontend (needs vite = dev dependency) --
Write-Host ""
Write-Host "[3/5] Building frontend (vite build)..." -ForegroundColor Yellow

Set-Location $BUILD_DIR
& cmd /c "npx vite build 2>&1" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK - Frontend built." -ForegroundColor Green

# -- Step 4: Run electron-builder (afterPack hook fixes missing deps) --
Write-Host ""
Write-Host "[4/5] Building installers (electron-builder)..." -ForegroundColor Yellow
Write-Host "  This rebuilds better-sqlite3 for Electron and may take a few minutes."
Write-Host "  The afterPack hook will auto-fix any missing dependencies."

Set-Location $BUILD_DIR
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
& cmd /c "npx electron-builder --config electron-builder.json --win nsis msi 2>&1" | ForEach-Object { Write-Host "  $_" }
Write-Host "  OK - Installers built." -ForegroundColor Green

# -- Step 5: Create output build folder --
Write-Host ""
Write-Host "[5/5] Creating transport package at $OUTPUT_DIR..." -ForegroundColor Yellow

if (Test-Path $OUTPUT_DIR) {
    Remove-Item -Path $OUTPUT_DIR -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -Path $OUTPUT_DIR -ItemType Directory -Force | Out-Null
New-Item -Path "$OUTPUT_DIR\Installers" -ItemType Directory -Force | Out-Null
New-Item -Path "$OUTPUT_DIR\Data" -ItemType Directory -Force | Out-Null

# Copy installers
$distDir = "$BUILD_DIR\electron-dist"
if (Test-Path $distDir) {
    $nsisExe = Get-Item "$distDir\TrierOS-Setup-*.exe" -ErrorAction SilentlyContinue
    if ($nsisExe) {
        Write-Host ('  Copying: ' + $nsisExe.Name)
        Copy-Item $nsisExe.FullName "$OUTPUT_DIR\Installers\"
    }
    $msiFile = Get-Item "$distDir\TrierOS-Setup-*.msi" -ErrorAction SilentlyContinue
    if ($msiFile) {
        Write-Host ('  Copying: ' + $msiFile.Name)
        Copy-Item $msiFile.FullName "$OUTPUT_DIR\Installers\"
    }
}

# Copy data directory
Write-Host "  Copying databases and config files..."
robocopy "$BUILD_DIR\data" "$OUTPUT_DIR\Data" /MIR /NFL /NDL /NJH /NJS /NC /NS /XF "*.db-shm" "*.db-wal" "*SNAP*" | Out-Null

Copy-Item "$BUILD_DIR\package.json" "$OUTPUT_DIR\" -ErrorAction SilentlyContinue
Copy-Item "$BUILD_DIR\electron-builder.json" "$OUTPUT_DIR\" -ErrorAction SilentlyContinue

Write-Host "  OK - Transport package created." -ForegroundColor Green

# -- Summary --
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output: $OUTPUT_DIR"
Write-Host ""

Write-Host "  Installers:" -ForegroundColor Cyan
Get-ChildItem "$OUTPUT_DIR\Installers" -ErrorAction SilentlyContinue | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    Write-Host ('    ' + $_.Name + ' (' + $sizeMB + ' MB)')
}

Write-Host ""
Write-Host "  Package verification:" -ForegroundColor Cyan
$checkPkgs = @("express", "better-sqlite3", "cors", "dotenv", "body-parser", "side-channel", "qs", "call-bind")
foreach ($pkg in $checkPkgs) {
    $exists = Test-Path "$distDir\win-unpacked\resources\app\node_modules\$pkg"
    $mark = if ($exists) { "OK" } else { "MISSING!" }
    $color = if ($exists) { "Green" } else { "Red" }
    Write-Host ('    ' + $pkg + ': ' + $mark) -ForegroundColor $color
}

$dbCount = @(Get-ChildItem "$OUTPUT_DIR\Data\*.db" -ErrorAction SilentlyContinue).Count
Write-Host ""
Write-Host ('  Data: ' + $dbCount + ' databases') -ForegroundColor Cyan
Write-Host ""
Write-Host "  Zip C:\TrierOS-Build and transport to target machines." -ForegroundColor Yellow
Write-Host "  Default install path: C:\Trier OS" -ForegroundColor Yellow
Write-Host ""
