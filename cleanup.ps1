Get-ChildItem -Path "data" | Where-Object { ($_.Name -match '\.db-shm$' -or $_.Name -match '\.db-wal$') } | ForEach-Object {
    $dbName = $_.Name -replace '-shm$','' -replace '-wal$',''
    if (-not (Test-Path "data\$dbName")) {
        Write-Host "Deleting orphaned file: $($_.FullName)"
        Remove-Item $_.FullName -Force
    }
}

Get-ChildItem -Path "data" | Where-Object { 
    $_.Name -match 'IMPORT_SNAP' -or 
    $_.Name -match 'RESET_SNAP' -or 
    $_.Name -match 'TEST_BACKUP' -or 
    $_.Name -match '^PrairieMaintenance\.db' 
} | ForEach-Object {
    Write-Host "Deleting old/snapshot file: $($_.FullName)"
    Remove-Item $_.FullName -Force
}
