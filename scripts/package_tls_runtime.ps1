# Copyright © 2026 Doug Trier. SPDX-License-Identifier: MIT.
# Package the existing Windows certificate-generation prerequisite without host keys.
param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$gitRuntime='C:\Program Files\Git\mingw64'
$runtime=Join-Path $OutputDirectory 'tls-runtime'
$required=@('openssl.exe','libcrypto-3-x64.dll','libssl-3-x64.dll')
foreach($name in $required){if(!(Test-Path -LiteralPath "$gitRuntime\bin\$name")){throw "Required Windows TLS build runtime missing: $name"}}
$license="$gitRuntime\share\licenses\openssl\LICENSE"
if(!(Test-Path -LiteralPath $license)){throw 'OpenSSL redistribution license missing'}
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
Copy-Item -LiteralPath "$gitRuntime\bin\openssl.exe" -Destination "$runtime\TrierOpenSSL.exe" -Force
Copy-Item -LiteralPath "$gitRuntime\bin\libcrypto-3-x64.dll","$gitRuntime\bin\libssl-3-x64.dll" -Destination $runtime -Force
Copy-Item -LiteralPath $license -Destination "$runtime\OPENSSL-LICENSE.txt" -Force
@('[req]','distinguished_name = req_dn','[req_dn]') | Set-Content -LiteralPath "$runtime\openssl.cnf" -Encoding ASCII
@('@echo off','setlocal','set "OPENSSL_CONF=%~dp0tls-runtime\openssl.cnf"','"%~dp0tls-runtime\TrierOpenSSL.exe" %*') | Set-Content -LiteralPath "$OutputDirectory\openssl.cmd" -Encoding ASCII
$version=& "$runtime\TrierOpenSSL.exe" version
if($LASTEXITCODE -ne 0){throw 'Bundled certificate runtime failed its version check'}
@('Windows certificate-generation runtime bundled for installation-specific TLS.', $version, 'OpenSSL is separately licensed under Apache-2.0; see OPENSSL-LICENSE.txt.', 'https://www.openssl.org/') | Set-Content -LiteralPath "$runtime\README.txt" -Encoding ASCII
Write-Host "  Bundled certificate generator: $version"
