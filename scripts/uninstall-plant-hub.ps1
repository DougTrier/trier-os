# ============================================================
# Trier OS — Plant Hub Service Uninstaller
# ============================================================
# Stops and removes the TrierOS-PlantHub Windows service
# and clears the firewall rules.
#
# USAGE:
#   Right-click -> Run with PowerShell (as Administrator)
# ============================================================

Set-StrictMode -Version Latest

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "  ERROR: Run as Administrator." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$ServiceName = "TrierOS-PlantHub"
$NssmExe     = "C:\nssm\nssm.exe"

Write-Host ""
Write-Host "  Trier OS Plant Hub Uninstaller" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $NssmExe)) {
    Write-Host "  NSSM not found at $NssmExe — cannot remove service." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "  Service '$ServiceName' not found — nothing to remove." -ForegroundColor Yellow
} else {
    Write-Host "  Stopping service..." -ForegroundColor Yellow
    & $NssmExe stop $ServiceName 2>$null
    Start-Sleep -Seconds 2
    Write-Host "  Removing service..." -ForegroundColor Yellow
    & $NssmExe remove $ServiceName confirm
    Write-Host "  Service removed." -ForegroundColor Green
}

Write-Host "  Removing firewall rules..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="Trier OS Web App" 2>$null | Out-Null
netsh advfirewall firewall delete rule name="Trier OS LAN Hub"  2>$null | Out-Null
Write-Host "  Firewall rules removed." -ForegroundColor Green

Write-Host ""
Write-Host "  Uninstall complete." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
