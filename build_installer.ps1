# Trier OS - Installer Build Script
# ======================================================================
# Must be run as Administrator (required for symlink creation during
# electron-builder's winCodeSign extraction)
#
# Usage: Run as Admin in PowerShell:
#   powershell -ExecutionPolicy Bypass -File build_installer.ps1
# ======================================================================
$ErrorActionPreference = "Stop"

$SOURCE_DIR   = $PSScriptRoot
. "$PSScriptRoot\scripts\build_directory_guard.ps1"
$buildId = [Guid]::NewGuid().ToString('N')
$BUILD_DIR = New-DistributionDirectory (Join-Path ([IO.Path]::GetPathRoot($SOURCE_DIR)) ("TB" + $buildId.Substring(0,8))) $SOURCE_DIR
$OUTPUT_DIR = New-DistributionDirectory (Join-Path (Split-Path -Parent $SOURCE_DIR) "TrierOS-Artifacts\$buildId") $SOURCE_DIR

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Trier OS - Installer Build Script" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 1: Clean and copy project --
Write-Host "[1/5] Preparing build directory..." -ForegroundColor Yellow

# A unique, new staging directory was reserved above; nothing is deleted.

Write-Host "  Copying project to $BUILD_DIR..."
robocopy $SOURCE_DIR $BUILD_DIR /MIR /NFL /NDL /NJH /NJS /NC /NS /XD "$SOURCE_DIR\data" "node_modules" ".git" "electron-dist" "__pycache__" ".gemini" "References" "Artifacts" "snapshots" "$SOURCE_DIR\data\certs" "$SOURCE_DIR\data\edge_keys" "$SOURCE_DIR\data\backups" "$SOURCE_DIR\data\snapshots" "$SOURCE_DIR\server\data" /XF "*.db-shm" "*.db-wal" "snapshot_backup_*" ".env" "*.key" ".sync_key" "first_login.txt" "*.sqlite" "*.sqlite3" "*.corrupt" "trier_auth.db" "trier_chat.db" "log.db" "studio_log.db" "local-sqlite.db" "trier_os.db" "SECURITY_REMEDIATION_REPORT_*.md" "Recomendations.md" "PRE_372_RELEASE_STATE.md" "DOCUMENTATION_MAINTENANCE_REPORT_*.md" "TRIER_OS_3.7.2_RELEASE_PREPARATION_REPORT.md" "RELEASE_ARTIFACT_MANIFEST_3.7.2.md" "RELEASE_NOTES_3.7.2_DRAFT.md" | Out-Null
Write-Host "  OK - Project copied." -ForegroundColor Green
& "$SOURCE_DIR\scripts\package_tls_runtime.ps1" -OutputDirectory $BUILD_DIR

# Materialize only the committed, hash-verified distribution seeds.
& (Get-Command node).Source "$SOURCE_DIR\scripts\prepare_release_data.js" "$BUILD_DIR\data"
if ($LASTEXITCODE -ne 0) { throw "Release seed verification failed." }

# -- Step 2: Install ALL dependencies --
Write-Host ""
Write-Host "[2/5] Installing all dependencies..." -ForegroundColor Yellow

Set-Location $BUILD_DIR
& cmd /c "npm install 2>&1" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
Write-Host "  OK - All dependencies installed." -ForegroundColor Green

# -- Step 2b: Rebuild native modules for Electron's Node.js ABI --
# better-sqlite3 is a native module; system Node.js and Electron embed different
# Node.js ABIs so the module must be recompiled against the Electron headers.
Write-Host ""
Write-Host "[2b/5] Rebuilding native modules for Electron..." -ForegroundColor Yellow

Set-Location $BUILD_DIR
& cmd /c "npx --yes @electron/rebuild 2>&1" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Native module rebuild failed.' }
Write-Host "  OK - Native modules rebuilt for Electron." -ForegroundColor Green

# -- Step 3: Build frontend (needs vite = dev dependency) --
Write-Host ""
Write-Host "[3/5] Building frontend (vite build)..." -ForegroundColor Yellow

Set-Location $BUILD_DIR
& cmd /c "npx vite build 2>&1" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Production frontend build failed.' }
Write-Host "  OK - Frontend built." -ForegroundColor Green

# -- Step 4: Run electron-builder (afterPack hook fixes missing deps) --
Write-Host ""
Write-Host "[4/5] Building installers (electron-builder)..." -ForegroundColor Yellow
Write-Host "  This rebuilds better-sqlite3 for Electron and may take a few minutes."
Write-Host "  The afterPack hook will auto-fix any missing dependencies."

Set-Location $BUILD_DIR
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
& cmd /c "npx electron-builder --config electron-builder.json --win nsis msi 2>&1" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
Write-Host "  OK - Installers built." -ForegroundColor Green
# MSI lifecycle actions are compiled before signing by msi-preservation.js.
# Mutable data is never packaged as a managed MSI component.
foreach ($msi in Get-ChildItem -LiteralPath "$BUILD_DIR\electron-dist" -Filter '*.msi') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SOURCE_DIR\scripts\package_msi_data.ps1" -MsiPath $msi.FullName
    if ($LASTEXITCODE -ne 0) { throw 'MSI preservation validation failed.' }
}

# -- Step 5: Create output build folder --
Write-Host ""
Write-Host "[5/5] Creating transport package at $OUTPUT_DIR..." -ForegroundColor Yellow

# Output is a new directory, never the default installation location.
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
robocopy "$BUILD_DIR\data" "$OUTPUT_DIR\Data" /MIR /NFL /NDL /NJH /NJS /NC /NS /XD "$BUILD_DIR\data\certs" "$BUILD_DIR\data\edge_keys" "$BUILD_DIR\data\backups" "$BUILD_DIR\data\snapshots" /XF "*.db-shm" "*.db-wal" "*SNAP*" ".sync_key" "*.key" ".env*" "first_login.txt" "trier_auth.db" | Out-Null

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
