# Copyright (c) 2026 Doug Trier. Trier OS source is MIT licensed.
# Read-only release gate: seeds must be separate from live data and the compiled
# MSI must prepare backups before it installs files or removes the old product.
param([Parameter(Mandatory=$true)][string]$MsiPath)
$ErrorActionPreference='Stop'
function Call($object,[string]$method,$arguments){$object.GetType().InvokeMember($method,'InvokeMethod',$null,$object,$arguments)}
function Value($object,[int]$index){$object.GetType().InvokeMember('StringData','GetProperty',$null,$object,@($index))}
$installer=New-Object -ComObject WindowsInstaller.Installer
$db=Call $installer 'OpenDatabase' @((Resolve-Path -LiteralPath $MsiPath).Path,0)
$view=Call $db 'OpenView' @('SELECT `Directory`,`Directory_Parent`,`DefaultDir` FROM `Directory`')
Call $view 'Execute' @() | Out-Null
$dirs=@{}
while($row=Call $view 'Fetch' @()){$dirs[(Value $row 1)]=@{Parent=(Value $row 2);Name=((Value $row 3).Split(':')[0].Split('|')[-1])}}
Call $view 'Close' @() | Out-Null
function LogicalPath([string]$id){if(!$id){return ''};$d=$dirs[$id];$parent=LogicalPath $d.Parent;if($d.Name -in @('.','SourceDir')){return $parent};return (($parent+'/'+$d.Name).Trim('/'))}
$view=Call $db 'OpenView' @('SELECT `File`.`File`,`File`.`FileName`,`File`.`Attributes`,`Component`.`Directory_` FROM `File`,`Component` WHERE `File`.`Component_` = `Component`.`Component`')
Call $view 'Execute' @() | Out-Null
$targets=@()
while($row=Call $view 'Fetch' @()){
 $name=(Value $row 2).Split('|')[-1];$folder=LogicalPath (Value $row 4)
 if($folder -match '(^|/)resources/(data|app/data|app/server/data)($|/)'){throw 'MSI contains files in a live data directory.'}
 if($folder -match '(^|/)resources/seed-data$' -and $name -like '*.db'){$targets+=@{Id=(Value $row 1);Name=$name}}
}
Call $view 'Close' @() | Out-Null
if(!$targets.Count){throw 'MSI has no fresh-install seed databases.'}
$view=Call $db 'OpenView' @('SELECT `Action`,`Sequence` FROM `InstallExecuteSequence`')
Call $view 'Execute' @() | Out-Null
$sequence=@{}
while($row=Call $view 'Fetch' @()){$sequence[(Value $row 1)]=[int](Value $row 2)}
Call $view 'Close' @() | Out-Null
foreach($action in @('TrPrepare','TrRollback','TrCommit','TrComplete','TrDetach','TrReconnect')) {
 if(!$sequence.ContainsKey($action)){throw "Missing preservation action: $action"}
}
if($sequence.TrRollback -ge $sequence.TrPrepare -or $sequence.TrPrepare -le $sequence.InstallInitialize -or $sequence.TrPrepare -ge $sequence.InstallFiles -or $sequence.TrPrepare -ge $sequence.RemoveExistingProducts -or $sequence.TrCommit -le $sequence.RemoveExistingProducts){throw 'Unsafe preservation action ordering.'}
$view=$null;$update=$null;$record=$null;$row=$null;$db=$null;$installer=$null
[GC]::Collect();[GC]::WaitForPendingFinalizers()
Write-Output "MSI preservation verified: $($targets.Count) seed databases, no managed live-data files, backup and rollback actions ordered correctly. Package was not modified."
