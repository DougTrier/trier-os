# Trier OS � Portable Build Script
$ErrorActionPreference = "Stop"

$SOURCE   = $PSScriptRoot
$BUILD    = $args[0]
if (-not $BUILD) { $BUILD = ("G:\TrierOS-v" + (Get-Content -Raw -LiteralPath "$SOURCE\package.json" | ConvertFrom-Json).version) }
$NODE_EXE = (Get-Command node).Source

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Trier OS - Portable Build" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Source:  $SOURCE"
Write-Host "  Output:  $BUILD"
Write-Host ""

# Step 1: Clean
Write-Host "[1/7] Preparing build directory..." -ForegroundColor Yellow
. "$PSScriptRoot\scripts\build_directory_guard.ps1"
$BUILD = New-DistributionDirectory $BUILD $SOURCE
Write-Host "  OK" -ForegroundColor Green

# Step 2: Build frontend
Write-Host "[2/7] Building production frontend..." -ForegroundColor Yellow
Set-Location $SOURCE
& cmd /c "npx vite build 2>&1" | Select-String "built in" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Production frontend build failed.' }
Write-Host "  OK" -ForegroundColor Green

# Step 2b: Bundle Monaco editor for self-hosted IDE (no CDN, works air-gapped)
Write-Host "[2b] Bundling Monaco editor..." -ForegroundColor Yellow
$monacoSrc = "$SOURCE\node_modules\monaco-editor\min\vs"
$monacoDst = "$SOURCE\dist\monaco-vs"
if (Test-Path $monacoSrc) {
    robocopy $monacoSrc $monacoDst /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    Write-Host "  Monaco bundled into dist/monaco-vs/" -ForegroundColor Green
} else {
    Write-Host "  WARNING: monaco-editor not found in node_modules" -ForegroundColor Red
}

# Step 3: Copy app files
Write-Host "[3/7] Copying application files..." -ForegroundColor Yellow
robocopy "$SOURCE\server" "$BUILD\server" /MIR /XD "$SOURCE\server\data" /XF "*.db" "*.sqlite" "*.sqlite3" "*.key" ".env*" "first_login.txt" ".sync_key" /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "  server/"
robocopy "$SOURCE\src" "$BUILD\src" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "  src/"
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
# Per-installation secrets are provisioned by the operator, never distributed.
@"
JWT_SECRET=
HUB_TOKEN_SECRET=
PORT=3000
NODE_ENV=production
DISABLE_LIVE_STUDIO=true
ALLOWED_ORIGINS=http://localhost:3000
"@ | Set-Content -LiteralPath "$BUILD\.env.example" -Encoding ASCII
Copy-Item -LiteralPath "$SOURCE\LICENSE" -Destination "$BUILD\LICENSE" -Force
Copy-Item -LiteralPath "$SOURCE\TRADEMARKS.md" -Destination "$BUILD\TRADEMARKS.md" -Force
Write-Host "  Operator provisioning template; no session secrets distributed" -ForegroundColor Green
Copy-Item "$SOURCE\index.html" "$BUILD\" -Force
Copy-Item "$SOURCE\vite.config.js" "$BUILD\" -Force
Write-Host "  config files"
Write-Host "  OK" -ForegroundColor Green

# Step 4: Materialize committed demonstration/reference seeds, never live data.
Write-Host "[4/7] Verifying distribution seeds..." -ForegroundColor Yellow
& $NODE_EXE "$SOURCE\scripts\prepare_release_data.js" "$BUILD\data"
if ($LASTEXITCODE -ne 0) { throw "Release seed verification failed." }
New-Item -Path "$BUILD\snapshots" -ItemType Directory -Force | Out-Null

# Step 5: Install production deps
Write-Host "[5/7] Installing production dependencies..." -ForegroundColor Yellow
Set-Location $BUILD
& cmd /c "npm install --production --ignore-scripts 2>&1" | Select-String "added" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Portable dependency installation failed.' }
Write-Host "  Rebuilding native modules..."
& cmd /c "npm rebuild better-sqlite3 2>&1" | Select-String "better-sqlite3" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Portable native module rebuild failed.' }
Write-Host "  Installing vite for Live Studio deploy pipeline..."
$viteVersion = & $NODE_EXE -p "require(process.argv[1]).packages['node_modules/vite'].version" "$SOURCE\package-lock.json"
$pluginVersion = & $NODE_EXE -p "require(process.argv[1]).packages['node_modules/@vitejs/plugin-react'].version" "$SOURCE\package-lock.json"
if (-not $viteVersion -or -not $pluginVersion) { throw "Lockfile build-tool versions could not be read." }
& cmd /c "npm install --no-save vite@$viteVersion @vitejs/plugin-react@$pluginVersion 2>&1" | Select-String "added" | ForEach-Object { Write-Host "  $_" }
if ($LASTEXITCODE -ne 0) { throw 'Portable build-tool installation failed.' }
Write-Host "  OK" -ForegroundColor Green

# Step 6: Bundle Node.js
Write-Host "[6/7] Bundling Node.js runtime..." -ForegroundColor Yellow
New-Item -Path "$BUILD\runtime" -ItemType Directory -Force | Out-Null
Copy-Item $NODE_EXE "$BUILD\runtime\node.exe" -Force
$nodeVer = & "$BUILD\runtime\node.exe" -v
Write-Host "  Bundled node.exe $nodeVer" -ForegroundColor Cyan
Write-Host "  OK" -ForegroundColor Green

# Step 7: Create launchers
New-Item -ItemType Directory -Path "$BUILD\electron" -Force | Out-Null
foreach ($file in @('preserve-data.ps1','storage.js','portable-start.js','portable-start.ps1','program-inventory.js')) {
    Copy-Item -LiteralPath "$SOURCE\electron\$file" -Destination "$BUILD\electron\$file"
}
# Distribution seeds have a distinct name; extracting over an old portable
# installation cannot overwrite its data directory.
$seedSource = [IO.Path]::GetFullPath("$BUILD\data")
if (!$seedSource.StartsWith($BUILD+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid staging path' }
Move-Item -LiteralPath $seedSource -Destination "$BUILD\seed-data"
& "$SOURCE\scripts\package_tls_runtime.ps1" -OutputDirectory $BUILD
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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File electron\portable-start.ps1
echo.
echo  Server stopped. Press any key to exit.
pause > nul
'@
$batContent | Set-Content -Path (Join-Path $BUILD "Trier OS.bat") -Encoding ASCII
& $NODE_EXE "$SOURCE\electron\program-inventory.js" $BUILD
if ($LASTEXITCODE -ne 0) { throw 'Portable inventory failed.' }

Write-Host "  Trier OS.bat created" -ForegroundColor Cyan
Write-Host "  OK" -ForegroundColor Green

# Summary
$totalSize = [math]::Round((Get-ChildItem $BUILD -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1048576, 0)
$fileCount = (Get-ChildItem $BUILD -Recurse -File).Count

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
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
