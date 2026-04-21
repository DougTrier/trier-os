# ============================================================
# Trier OS — Plant Hub Service Installer
# ============================================================
# Installs the Trier OS Node.js server as a Windows Service
# with LAN_HUB_ENABLED=true so the plant-local hub runs on
# port 1940 independently of the Electron desktop app.
#
# REQUIREMENTS:
#   - Run as Administrator
#   - Node.js 18+ installed and in PATH
#   - Internet access on first run (downloads NSSM)
#
# USAGE:
#   Right-click -> Run with PowerShell (as Administrator)
#   OR: powershell -ExecutionPolicy Bypass -File install-plant-hub.ps1
# ============================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Guard: must be Administrator ─────────────────────────────────────────────
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host ""
    Write-Host "  ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "  Right-click the script and choose 'Run as Administrator'." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Configuration ─────────────────────────────────────────────────────────────
$ServiceName    = "TrierOS-PlantHub"
$ServiceDisplay = "Trier OS Plant Hub"
$ServiceDesc    = "Trier OS local plant hub — LAN peer sync and offline resilience on port 1940."
$AppDir         = Split-Path -Parent $PSScriptRoot
$ServerScript   = Join-Path $AppDir "server\index.js"
$LogDir         = Join-Path $AppDir "logs"
$NssmDir        = "C:\nssm"
$NssmExe        = "$NssmDir\nssm.exe"
$NssmZipUrl     = "https://nssm.cc/release/nssm-2.24.zip"
$WebPort        = "1938"
$HubPort        = "1940"

Write-Host ""
Write-Host "  Trier OS Plant Hub Installer" -ForegroundColor Cyan
Write-Host "  =============================" -ForegroundColor Cyan
Write-Host "  App directory : $AppDir"
Write-Host "  Web port      : $WebPort"
Write-Host "  Hub port      : $HubPort"
Write-Host ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $NodeExe) {
    Write-Host "  ERROR: Node.js not found in PATH." -ForegroundColor Red
    Write-Host "  Install Node.js 18+ from https://nodejs.org and re-run." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}
$NodePath = $NodeExe.Source
$NodeVersion = & node --version
Write-Host "  Node.js       : $NodeVersion at $NodePath" -ForegroundColor Green

# ── Check server script exists ────────────────────────────────────────────────
if (-not (Test-Path $ServerScript)) {
    Write-Host ""
    Write-Host "  ERROR: server\index.js not found at $ServerScript" -ForegroundColor Red
    Write-Host "  Run this script from the Trier OS installation directory." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Download NSSM if needed ───────────────────────────────────────────────────
if (-not (Test-Path $NssmExe)) {
    Write-Host ""
    Write-Host "  Downloading NSSM (service manager)..." -ForegroundColor Yellow
    $zipPath     = "$env:TEMP\nssm.zip"
    $extractPath = "$env:TEMP\nssm_extract"

    try {
        Invoke-WebRequest -Uri $NssmZipUrl -OutFile $zipPath -UseBasicParsing
        if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        New-Item -ItemType Directory -Force -Path $NssmDir | Out-Null
        Copy-Item "$extractPath\nssm-2.24\win64\nssm.exe" $NssmExe -Force
        Write-Host "  NSSM downloaded to $NssmExe" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR: Failed to download NSSM: $_" -ForegroundColor Red
        Write-Host "  Download nssm.exe manually from https://nssm.cc and place it at $NssmExe" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "  NSSM found at $NssmExe" -ForegroundColor Green
}

# ── Remove existing service if present ───────────────────────────────────────
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host ""
    Write-Host "  Removing existing '$ServiceName' service..." -ForegroundColor Yellow
    & $NssmExe stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    & $NssmExe remove $ServiceName confirm
    Write-Host "  Old service removed." -ForegroundColor Green
}

# ── Create logs directory ─────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── Install the service ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Installing Windows service..." -ForegroundColor Yellow

& $NssmExe install $ServiceName $NodePath $ServerScript

# Working directory
& $NssmExe set $ServiceName AppDirectory $AppDir

# Environment — LAN_HUB_ENABLED activates the hub without Electron
& $NssmExe set $ServiceName AppEnvironmentExtra `
    "LAN_HUB_ENABLED=true" `
    "NODE_ENV=production" `
    "PORT=$WebPort"

# Display metadata
& $NssmExe set $ServiceName DisplayName $ServiceDisplay
& $NssmExe set $ServiceName Description $ServiceDesc

# Auto-start at boot, restart on crash
& $NssmExe set $ServiceName Start SERVICE_AUTO_START
& $NssmExe set $ServiceName AppExit Default Restart
& $NssmExe set $ServiceName AppRestartDelay 5000

# Log rotation (10 MB / day)
& $NssmExe set $ServiceName AppStdout    (Join-Path $LogDir "plant-hub.log")
& $NssmExe set $ServiceName AppStderr    (Join-Path $LogDir "plant-hub-error.log")
& $NssmExe set $ServiceName AppRotateFiles  1
& $NssmExe set $ServiceName AppRotateOnline 1
& $NssmExe set $ServiceName AppRotateSeconds 86400
& $NssmExe set $ServiceName AppRotateBytes   10485760

Write-Host "  Service installed." -ForegroundColor Green

# ── Windows Firewall rules ────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Configuring Windows Firewall..." -ForegroundColor Yellow

# Remove old rules if they exist
netsh advfirewall firewall delete rule name="Trier OS Web App" 2>$null | Out-Null
netsh advfirewall firewall delete rule name="Trier OS LAN Hub"  2>$null | Out-Null

# Add inbound rules
netsh advfirewall firewall add rule `
    name="Trier OS Web App" `
    dir=in action=allow protocol=TCP localport=$WebPort | Out-Null

netsh advfirewall firewall add rule `
    name="Trier OS LAN Hub" `
    dir=in action=allow protocol=TCP localport=$HubPort | Out-Null

Write-Host "  Firewall rules added (ports $WebPort and $HubPort)." -ForegroundColor Green

# ── Start the service ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Starting service..." -ForegroundColor Yellow
& $NssmExe start $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$status = if ($svc) { $svc.Status } else { "Unknown" }

# ── Get this machine's IP ─────────────────────────────────────────────────────
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Service name   : $ServiceName"
Write-Host "  Service status : $status"
Write-Host "  Web app port   : $WebPort"
Write-Host "  Hub port       : $HubPort"
Write-Host "  Logs           : $LogDir\"
Write-Host ""
if ($localIp) {
    Write-Host "  This machine's IP address:" -ForegroundColor Yellow
    Write-Host "    $localIp" -ForegroundColor White
    Write-Host ""
    Write-Host "  Enter this IP in Trier OS -> Plant Setup -> LAN Hub IP Address" -ForegroundColor Yellow
}
Write-Host ""
Read-Host "Press Enter to exit"
