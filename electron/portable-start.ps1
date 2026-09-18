# Copyright (c) 2026 Doug Trier. MIT License; see root LICENSE.
# Initialize storage before launching Node; no DB process exists during adoption.
$ErrorActionPreference = 'Stop'
$install = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if (!(Test-Path -LiteralPath (Join-Path $install 'trier-deployment.json'))) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $id = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($install.ToLowerInvariant()))).Replace('-','').Substring(0,24).ToLowerInvariant() }
    finally { $sha.Dispose() }
    $state = Join-Path $env:LOCALAPPDATA "TrierOS\portable\$id"
    foreach ($action in @('Prepare','Commit')) {
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PSScriptRoot\preserve-data.ps1" -Action $action -InstallDir $install -StateRoot $state -Layout Portable
        if ($LASTEXITCODE -ne 0) { throw "Persistent storage $action failed. No server was started." }
    }
}
& "$install\runtime\node.exe" "$PSScriptRoot\portable-start.js"
exit $LASTEXITCODE
