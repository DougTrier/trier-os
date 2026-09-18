# Copyright (c) 2026 Doug Trier. SPDX-License-Identifier: MIT.
# Licensed under the MIT License. See LICENSE in the repository root.
# Offline installer lifecycle. All copies are hash verified; no live SQLite
# connection is opened. Prepare runs BEFORE any old uninstaller or MSI removal.
param(
    [Parameter(Mandatory=$true)][ValidateSet('Prepare','Commit','Complete','Rollback','Restore','Uninstall','Detach','Reconnect','Reset','Verify')][string]$Action,
    [Parameter(Mandatory=$true)][string]$InstallDir,
    [string]$StateRoot = (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'TrierOS'),
    [string]$Confirmation = '',
    [ValidateSet('Electron','Portable')][string]$Layout = 'Electron',
    [switch]$KeepPending,
    [string]$RuntimeUserSid = ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value),
    [string]$Backup = '',
    [string]$ErrorLog = '',
    [ValidateSet('Manual','NSIS','MSI')][string]$PackageKind = 'Manual'
)
trap {
    if ($ErrorLog) { [IO.File]::WriteAllText($ErrorLog, ($_ | Out-String), [Text.Encoding]::Unicode) }
    exit 1
}
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$InstallDir = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\','/')
$StateRoot = [IO.Path]::GetFullPath($StateRoot).TrimEnd('\','/')
function Inside([string]$Child,[string]$Parent) { return $Child.Equals($Parent,[StringComparison]::OrdinalIgnoreCase) -or $Child.StartsWith($Parent+'\',[StringComparison]::OrdinalIgnoreCase) }
if ($InstallDir.Length -lt 5 -or $StateRoot.Length -lt 5 -or (Inside $StateRoot $InstallDir) -or (Inside $InstallDir $StateRoot)) { throw 'Installation and persistent storage must be separate, non-root directories.' }
function Assert-NoLink([string]$Path) {
    $check = $Path
    while ($check) {
        if ((Test-Path -LiteralPath $check) -and ((Get-Item -LiteralPath $check -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Unexpected link in managed path: $check" }
        $parent = [IO.Directory]::GetParent($check)
        if (!$parent) { break }; $check = $parent.FullName
    }
}
Assert-NoLink $StateRoot
Assert-NoLink $InstallDir
$newState = !(Test-Path -LiteralPath $StateRoot)
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
if ($newState) {
    # Restrict secrets and recovery copies to the installation's operator,
    # Administrators and SYSTEM. Never grant all local users database write access.
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($sid in @('S-1-5-18','S-1-5-32-544',$RuntimeUserSid) | Select-Object -Unique) {
        $identity = [Security.Principal.SecurityIdentifier]::new($sid)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    (Get-Item -LiteralPath $StateRoot).SetAccessControl($acl)
}
$lock = [IO.File]::Open((Join-Path $StateRoot 'installer.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$manifestPath = Join-Path $StateRoot 'deployment.json'
$pendingPath = Join-Path $StateRoot 'maintenance.json'
$live = Join-Path $StateRoot 'live'
$backupRoot = Join-Path $StateRoot 'backups'
function Read-Json([string]$Path) { if (Test-Path -LiteralPath $Path) { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }; return $null }
function Write-Json([string]$Path,$Value) {
    $tmp = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($tmp, ($Value | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $Path) {
        [IO.File]::Replace($tmp,$Path,$tmp+'.previous')
        [IO.File]::Delete($tmp+'.previous')
    } else { [IO.File]::Move($tmp,$Path) }
}
function Hash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function Copy-Verified([string]$Source,[string]$Destination) {
    # A source already open by SQLite (or any writer) must fail, not produce a
    # misleading backup. Hold exclusive handles for the complete copy interval.
    $handles = @{}; $records = [Collections.Generic.List[object]]::new()
    try {
        $files = @(Get-ChildItem -LiteralPath $Source -Recurse -Force -File)
        if (@(Get-ChildItem -LiteralPath $Source -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Backup source contains a reparse point.' }
        foreach ($file in $files) {
            if ($file.Name -match '\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$') {
                $handles[$file.FullName] = [IO.File]::Open($file.FullName,'Open','Read','None')
            }
        }
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        foreach ($dir in @(Get-ChildItem -LiteralPath $Source -Recurse -Force -Directory)) {
            New-Item -ItemType Directory -Path (Join-Path $Destination $dir.FullName.Substring($Source.Length+1)) -Force | Out-Null
        }
        foreach ($file in $files) {
            $stream = $handles[$file.FullName]
            $temporary = !$stream
            if ($temporary) { $stream = [IO.File]::Open($file.FullName,'Open','Read','None') }
            try {
            $relative = $file.FullName.Substring($Source.Length+1)
            $dest = Join-Path $Destination $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
            $out = [IO.File]::Open($dest,'CreateNew','Write','None')
            try { $stream.CopyTo($out); $out.Flush($true) } finally { $out.Dispose() }
            $stream.Position = 0
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally { $sha.Dispose() }
            if ((Hash $dest) -ne $digest) { throw "Backup verification failed: $relative" }
            $records.Add(@{ Path=$relative; SHA256=$digest; Length=$file.Length })
            } finally { if ($temporary) { $stream.Dispose() } }
        }
        return ,($records.ToArray())
    } finally { foreach ($stream in $handles.Values) { $stream.Dispose() } }
}
function Verify-Backup($Transaction) {
    if (!(Inside ([IO.Path]::GetFullPath($Transaction.Backup)) $backupRoot)) { throw 'Backup escaped recovery storage.' }
    foreach ($record in $Transaction.Files) {
        $target = [IO.Path]::GetFullPath((Join-Path $Transaction.Backup $record.Path))
        if (!(Inside $target $Transaction.Backup) -or !(Test-Path -LiteralPath $target) -or (Hash $target) -ne $record.SHA256) { throw 'Backup manifest verification failed.' }
    }
}
function Assert-Manifest($Manifest) {
    if (!$Manifest) { return }
    if ($Manifest.InstallDir -ne $InstallDir) { throw 'Persistent storage belongs to another installation directory. Use its existing location.' }
    foreach ($map in $Manifest.Mappings) {
        $destination = [IO.Path]::GetFullPath((Join-Path $InstallDir $map.Relative))
        if (!(Inside $destination $InstallDir) -or $destination -eq $InstallDir -or
            (!(Inside ([IO.Path]::GetFullPath($map.Target)) $live) -and $map.Target -ne $Manifest.ExternalDataDir)) { throw 'Invalid persistent data mapping.' }
        Assert-NoLink $map.Target
    }
}
function Read-ExternalDataDir {
    $configRoot = if ($Layout -eq 'Portable') { $InstallDir } else { Join-Path $InstallDir 'resources\app' }
    $envFile = Join-Path $configRoot '.env'
    if (!(Test-Path -LiteralPath $envFile)) { return $null }
    foreach ($line in [IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*DATA_DIR\s*=\s*(.+?)\s*$') {
            $configured = $Matches[1].Trim('"',"'")
            if (![IO.Path]::IsPathRooted($configured)) { $configured = Join-Path $configRoot $configured }
            $configured = [IO.Path]::GetFullPath($configured).TrimEnd('\','/')
            if (Inside $configured $InstallDir) { throw 'Custom DATA_DIR inside program files requires relocation before installation; no files were removed.' }
            if (!(Test-Path -LiteralPath $configured -PathType Container)) { throw 'Configured DATA_DIR is missing; refusing to create a replacement database.' }
            Assert-NoLink $configured
            return $configured
        }
    }
    return $null
}
function Assert-Stopped {
    # Never terminate another instance or a user's processes from an installer.
    $running = @(Get-CimInstance Win32_Process | Where-Object {
        $_.ProcessId -ne $PID -and $_.ExecutablePath -and ((Inside $_.ExecutablePath $InstallDir) -or
            ($_.Name -match '^(node|electron)\.exe$' -and $_.CommandLine -and $_.CommandLine.Contains($InstallDir+'\'))) -and
        $_.Name -notmatch '^(Uninstall|TrierOS-Setup|msiexec)'
    })
    if ($running.Count) { throw 'Stop Trier OS and its server before changing the installation.' }
}
function Remove-Links($Manifest) {
    if (!$Manifest) { return }
    foreach ($map in $Manifest.Mappings) {
        $target = Join-Path $InstallDir $map.Relative
        if (Test-Path -LiteralPath $target) {
            $item = Get-Item -LiteralPath $target -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                if ([IO.Path]::GetFullPath($item.Target[0]) -ne [IO.Path]::GetFullPath($map.Target)) { throw 'Persistent directory link target changed.' }
                [IO.Directory]::Delete($target) # unlink only, NEVER recurse into data
            }
        }
    }
}
function Connect-Data($Manifest) {
    foreach ($map in $Manifest.Mappings) {
        $destination = Join-Path $InstallDir $map.Relative
        if (Test-Path -LiteralPath $destination) {
            $item = Get-Item -LiteralPath $destination -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                if ([IO.Path]::GetFullPath($item.Target[0]) -eq [IO.Path]::GetFullPath($map.Target)) { continue }
                throw 'Unexpected persistent directory link.'
            }
            # Only a legacy directory captured by this transaction may remain.
            # Keep it as an extra recovery copy outside the installer tree.
            $retained = Join-Path $backupRoot ('retained-' + [Guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $destination -Destination $retained
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        New-Item -ItemType Junction -Path $destination -Target $map.Target | Out-Null
    }
    Write-Json (Join-Path $InstallDir 'trier-deployment.json') @{ StateRoot=$StateRoot; DataDir=$Manifest.DataDir }
}
try {
    $manifest = Read-Json $manifestPath
    $pending = Read-Json $pendingPath
    Assert-Manifest $manifest
    if ($Action -eq 'Verify') { if (!$pending) { throw 'No pending backup to verify.' }; Verify-Backup $pending; exit 0 }
    Assert-Stopped
    if ($Action -eq 'Prepare') {
        # Installer formats have different ownership databases. Never leave an
        # old MSI registered against compatibility links created by an EXE (or
        # vice versa): its future uninstaller could follow them into live data.
        if ($StateRoot -eq (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'TrierOS')) {
            if ($PackageKind -eq 'MSI') {
                foreach ($hive in @('HKLM:','HKCU:')) {
                    $oldNsis = Join-Path $hive 'Software\2d39c61a-6adc-5309-b2f8-51b9a3c57198'
                    if (Test-Path -LiteralPath $oldNsis) { throw 'Existing EXE installation detected. Use Update Existing Installation in the EXE package; installer-format switching is blocked.' }
                }
            } elseif ($PackageKind -eq 'NSIS') {
                foreach ($hive in @('HKLM:','HKCU:')) {
                    $uninstall = Join-Path $hive 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
                    foreach ($entry in @(Get-ChildItem -LiteralPath $uninstall -ErrorAction SilentlyContinue)) {
                        $product = Get-ItemProperty -LiteralPath $entry.PSPath
                        if ($product.PSObject.Properties['DisplayName'] -and $product.DisplayName -eq 'Trier OS' -and
                            $product.PSObject.Properties['WindowsInstaller'] -and $product.WindowsInstaller -eq 1) {
                            throw 'Existing MSI installation detected. Use its MSI updater; installer-format switching is blocked.'
                        }
                    }
                }
            }
        }
        if ($pending) {
            if ($pending.InstallDir -ne $InstallDir) { throw 'Another installation has an unfinished operation.' }
            Verify-Backup $pending
            Remove-Links $manifest
            Write-Output 'Resuming Update Existing Installation with the verified backup.'
            exit 0
        }
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        $backup = Join-Path $backupRoot ('upgrade-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        # Known compatibility links are detached before the old uninstaller can
        # recurse into them. Persistent data is backed up independently below.
        Remove-Links $manifest
        $records = @()
        $externalDataDir = if ($manifest) { $manifest.ExternalDataDir } else { Read-ExternalDataDir }
        if ($externalDataDir) {
            foreach ($record in (Copy-Verified $externalDataDir (Join-Path $backup 'external-data'))) { $record.Path='external-data\'+$record.Path; $records += $record }
        }
        if (Test-Path -LiteralPath $InstallDir) {
            foreach ($record in (Copy-Verified $InstallDir (Join-Path $backup 'program'))) { $record.Path='program\'+$record.Path; $records += $record }
        }
        if (Test-Path -LiteralPath $live) {
            foreach ($record in (Copy-Verified $live (Join-Path $backup 'live'))) { $record.Path='live\'+$record.Path; $records += $record }
        }
        if (!$manifest) {
            $mappings = @()
            $slots = @('resources\data','data','resources\app\data','resources\app\server\data','server\data',
                'resources\app\data_secondary','data_secondary','resources\app\snapshots','snapshots',
                'resources\app\uploads','uploads','resources\app\public\uploads','public\uploads',
                'resources\app\server\connectors','server\connectors','Legacy Databases','PMC',
                'resources\app\Legacy Databases','resources\app\PMC','resources\app\logs','logs')
            $primary = if ($Layout -eq 'Portable') { 'data' } else { 'resources\data' }
            $seedPending = !(Test-Path -LiteralPath (Join-Path $InstallDir $primary))
            # An interrupted initial adoption can be retried because no old
            # uninstaller runs until Prepare has returned successfully.
            if (Test-Path -LiteralPath $live) {
                Move-Item -LiteralPath $live -Destination (Join-Path $backupRoot ('incomplete-adoption-' + [Guid]::NewGuid().ToString('N')))
            }
            foreach ($relative in $slots) {
                $source = Join-Path $InstallDir $relative
                if ((Test-Path -LiteralPath $source) -or $relative -eq $primary) {
                    $target = Join-Path $live ($relative.Replace('\','_'))
                    if (Test-Path -LiteralPath $target) { throw 'Unregistered persistent data exists. Refusing to seed or overwrite it.' }
                    if (Test-Path -LiteralPath $source) { Copy-Verified $source $target | Out-Null }
                    else { New-Item -ItemType Directory -Path $target -Force | Out-Null }
                    $mappings += @{ Relative=$relative; Target=$target }
                }
            }
            # Old application-relative consumers must resolve to the same
            # primary store when they did not already contain distinct data.
            foreach ($relative in @('resources\app\data','resources\app\server\data','server\data')) {
                if (!($mappings | Where-Object Relative -EQ $relative)) {
                    $aliasTarget = if ($externalDataDir) { $externalDataDir } else { ($mappings | Where-Object Relative -EQ $primary).Target }
                    $mappings += @{ Relative=$relative; Target=$aliasTarget }
                }
            }
            $manifest = @{ Format=1; InstallDir=$InstallDir; DataDir=($mappings | Where-Object Relative -EQ $primary).Target; Mappings=$mappings; SeedPending=$seedPending; ExternalDataDir=$externalDataDir }
            if ($externalDataDir) { $manifest.DataDir=$externalDataDir; $manifest.SeedPending=$false }
            Write-Json $manifestPath $manifest
        }
        $pending = @{ InstallDir=$InstallDir; Backup=$backup; Files=$records; Format=1 }
        Write-Json (Join-Path $backup 'manifest.json') $pending
        Verify-Backup $pending
        Write-Json $pendingPath $pending
        Write-Output 'Update Existing Installation: verified backup complete; persistent data is protected.'
    } elseif ($Action -eq 'Commit') {
        if (!$manifest -or !$pending) { throw 'Installation has no verified preparation.' }
        Verify-Backup $pending
        if ($manifest.SeedPending) {
            $seed = if ($Layout -eq 'Portable') { Join-Path $InstallDir 'seed-data' } else { Join-Path $InstallDir 'resources\seed-data' }
            $receiptPath = Join-Path $StateRoot 'seed-pending.json'
            $receipt = Read-Json $receiptPath
            if (!$receipt) {
                if (!(Test-Path -LiteralPath $seed)) { throw 'Missing fresh-install seed data.' }
                if ((Test-Path -LiteralPath $manifest.DataDir) -and @(Get-ChildItem -LiteralPath $manifest.DataDir -Force).Count) { throw 'Fresh-install target is not empty. Refusing to reseed it.' }
                $staged = Join-Path $backupRoot ('seed-' + [Guid]::NewGuid().ToString('N'))
                $seedRecords = Copy-Verified $seed $staged
                $receipt = @{ Backup=$staged; Files=$seedRecords; DataDir=$manifest.DataDir }
                Write-Json $receiptPath $receipt
            }
            if ($receipt.DataDir -ne $manifest.DataDir) { throw 'Seed recovery belongs to a different data directory.' }
            if (Test-Path -LiteralPath $receipt.Backup) {
                Verify-Backup $receipt
                if (Test-Path -LiteralPath $manifest.DataDir) { [IO.Directory]::Delete($manifest.DataDir) } # empty only
                [IO.Directory]::Move($receipt.Backup,$manifest.DataDir)
            }
            # If power was lost after the move, validate the completed copy and
            # finish its receipt. Never copy over or reset a nonempty target.
            foreach ($record in $receipt.Files) {
                $seededFile = [IO.Path]::GetFullPath((Join-Path $manifest.DataDir $record.Path))
                if (!(Inside $seededFile $manifest.DataDir) -or (Hash $seededFile) -ne $record.SHA256) { throw 'Interrupted fresh-install verification failed.' }
            }
            if (@(Get-ChildItem -LiteralPath $manifest.DataDir -Recurse -File -Force).Count -ne @($receipt.Files).Count) { throw 'Unexpected data in pending fresh installation.' }
            $manifest.SeedPending = $false
            Write-Json $manifestPath $manifest
            Remove-Item -LiteralPath $receiptPath
        }
        Connect-Data $manifest
        # Restore customer configuration files; distribution never contains them.
        foreach ($relative in @('.env','resources\app\.env')) {
            $source = Join-Path $pending.Backup ('program\'+$relative)
            if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $InstallDir $relative) -Force }
        }
        if (!$KeepPending) { Remove-Item -LiteralPath $pendingPath }
        Write-Output 'Installation complete. Existing databases retained.'
    } elseif ($Action -eq 'Complete') {
        if ($pending) { Verify-Backup $pending; Remove-Item -LiteralPath $pendingPath }
    } elseif ($Action -eq 'Rollback') {
        if (!$pending) { exit 0 }; Verify-Backup $pending
        Remove-Links $manifest
        # Restore original program files from the verified pre-upgrade archive.
        # Persistent data is still authoritative outside the program directory.
        foreach ($record in $pending.Files) {
            if (!$record.Path.StartsWith('program\')) { continue }
            $relative = $record.Path.Substring(8)
            $destination = [IO.Path]::GetFullPath((Join-Path $InstallDir $relative))
            if (!(Inside $destination $InstallDir)) { throw 'Invalid recovery path.' }
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $pending.Backup $record.Path) -Destination $destination -Force
        }
        if ($manifest) { Connect-Data $manifest }
        Remove-Item -LiteralPath $pendingPath
        Write-Output 'Original program files restored; persistent data retained.'
    } elseif ($Action -eq 'Reconnect') {
        if ($manifest) { Connect-Data $manifest }
    } elseif ($Action -eq 'Detach') {
        if (!$manifest) { throw 'Unknown installation; refusing removal without preservation.' }
        Remove-Links $manifest
    } elseif ($Action -eq 'Uninstall') {
        if (!$manifest) { throw 'Unknown installation: preservation must be prepared first.' }
        Remove-Links $manifest
        # The manifest contains package files only. Unrecognized/customer files
        # are retained, and directories are removed only when empty.
        $files = Read-Json (Join-Path $InstallDir 'program-files.json')
        if (!$files) { throw 'Missing program file inventory; refusing recursive uninstall.' }
        foreach ($relative in $files) {
            $target = [IO.Path]::GetFullPath((Join-Path $InstallDir $relative))
            if (!(Inside $target $InstallDir)) { throw 'Program inventory escaped installation directory.' }
            Assert-NoLink (Split-Path -Parent $target)
            if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
        }
    } elseif ($Action -eq 'Restore') {
        if ($Confirmation -cne 'RESTORE TRIER OS DATA') { throw 'Restore replaces current data and requires: RESTORE TRIER OS DATA' }
        if (!$manifest -or $pending -or $manifest.ExternalDataDir) { throw 'Finish installation first. Externally managed data requires its own restore procedure.' }
        $Backup = [IO.Path]::GetFullPath($Backup)
        if (!(Inside $Backup (Join-Path $manifest.DataDir 'backups'))) { throw 'Select a verified pre-startup backup from this deployment.' }
        Assert-NoLink $Backup
        $recovery = Read-Json (Join-Path $Backup 'manifest.json')
        if (!$recovery) { throw 'Missing startup backup manifest.' }
        $stage = Join-Path $backupRoot ('restore-stage-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        foreach ($record in $recovery.files) {
            $source = [IO.Path]::GetFullPath((Join-Path $Backup $record.path))
            $target = [IO.Path]::GetFullPath((Join-Path $stage $record.path))
            if (!(Inside $source $Backup) -or !(Inside $target $stage) -or (Hash $source) -ne $record.sha256) { throw 'Startup backup verification failed.' }
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target
            if ((Hash $target) -ne $record.sha256) { throw 'Restore copy verification failed.' }
        }
        # Verify and retain the current state before replacing it. Exclusive DB
        # handles also prevent restoring while an external SQLite writer is open.
        Copy-Verified $manifest.DataDir (Join-Path $backupRoot ('before-restore-' + [Guid]::NewGuid().ToString('N'))) | Out-Null
        Remove-Links $manifest
        $original = Join-Path $backupRoot ('restore-original-' + [Guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $manifest.DataDir -Destination $original
        try { [IO.Directory]::Move($stage,$manifest.DataDir) }
        catch { [IO.Directory]::Move($original,$manifest.DataDir); throw }
        Connect-Data $manifest
        Write-Output "Data restored. Previous state retained at $original. Restore matching application code before starting."
    } elseif ($Action -eq 'Reset') {
        if ($Confirmation -cne 'DELETE TRIER OS DATA') { throw 'Reset requires the exact confirmation: DELETE TRIER OS DATA' }
        if (!$manifest -or $pending) { throw 'Finish or recover the installation before resetting data.' }
        if ($manifest.ExternalDataDir) { throw 'Externally managed DATA_DIR is retained. Reset it through its own backed-up maintenance procedure.' }
        $backup = Join-Path $backupRoot ('reset-' + [Guid]::NewGuid().ToString('N'))
        $records = Copy-Verified $live $backup
        $verification = @{ Backup=$backup; Files=$records }
        Write-Json (Join-Path $backup 'manifest.json') $verification
        Verify-Backup $verification
        Remove-Links $manifest
        # Rename rather than erase; both the verified backup and original remain.
        Move-Item -LiteralPath $live -Destination (Join-Path $backupRoot ('reset-original-' + [Guid]::NewGuid().ToString('N')))
        foreach ($map in $manifest.Mappings) { New-Item -ItemType Directory -Path $map.Target -Force | Out-Null }
        Connect-Data $manifest
        $manifest.SeedPending = $true
        Write-Json $manifestPath $manifest
        Write-Output "Persistent data reset. Verified recovery copy: $backup"
    }
} catch {
    # A failed backup must not leave an otherwise usable installation detached.
    if ($manifest -and $Action -eq 'Prepare') { try { Connect-Data $manifest } catch { Write-Warning $_ } }
    Write-Error $_
    exit 1
} finally { $lock.Dispose() }
