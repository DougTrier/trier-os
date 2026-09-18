# Copyright (c) 2026 Doug Trier. MIT License; see root LICENSE.
# Build destinations must be new directories. Builds never erase prior outputs
# because a previous output may now be someone's deployed installation.
function New-DistributionDirectory([string]$Destination, [string]$Source) {
    $destinationPath = [IO.Path]::GetFullPath($Destination).TrimEnd('\','/')
    $sourcePath = [IO.Path]::GetFullPath($Source).TrimEnd('\','/')
    if ($destinationPath.Length -lt 5 -or $destinationPath -eq $sourcePath -or
        $destinationPath.StartsWith($sourcePath+'\',[StringComparison]::OrdinalIgnoreCase) -or
        (Test-Path -LiteralPath $destinationPath)) {
        throw 'Build destination must be a NEW directory outside the source. Existing directories are never erased.'
    }
    $parent = [IO.Directory]::GetParent($destinationPath)
    while ($parent) {
        if ((Test-Path -LiteralPath $parent.FullName) -and ((Get-Item -LiteralPath $parent.FullName -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Build destination has a linked ancestor.'
        }
        $parent = $parent.Parent
    }
    New-Item -ItemType Directory -Path $destinationPath -ErrorAction Stop | Out-Null
    return $destinationPath
}
