// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Actual NSIS/MSI executable tests with unique per-user product identities and
 * TEMP-only installation/data paths. Uses production hooks with test-scoped
 * registry/storage overrides; never executes a production Trier OS installer.
 * testPackages(context): compilation, upgrade, uninstall and retained reinstall.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function testPackages({ root, repo, seed, snapshot, pass, run }) {
    const wix = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache/wix/wix-4.0.0.5512.2');
    const nsis = path.join(process.env.LOCALAPPDATA, 'electron-builder/Cache/nsis/nsis-3.0.4.1/makensis.exe');
    const key = 'Software\\TrierOS-Preservation-Tests\\' + crypto.randomUUID();
    const uuid = () => crypto.randomUUID().toUpperCase();
    const products = [];
    const write = (file, contents) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, contents); };
    try {
        for (const kind of ['msi', 'nsis']) {
            const base = path.join(root, kind);
            const install = path.join(base, 'install');
            const state = path.join(base, 'state');
            const legacy = path.join(install, 'resources/data');
            seed(legacy);
            const expected = snapshot(legacy);
            write(path.join(install, 'legacy-program.txt'), 'old code');
            const payload = path.join(base, 'program.txt');
            write(payload, 'new code');
            const inventory = path.join(base, 'program-files.json');
            write(inventory, JSON.stringify(['program.txt', 'program-files.json']));
            const packageFile = path.join(base, 'fixture.' + (kind === 'msi' ? 'msi' : 'exe'));
            const manifest = () => JSON.parse(fs.readFileSync(path.join(state, 'deployment.json')));
            if (kind === 'msi') {
                const product = uuid();
                products.push(product);
                const upgrade = uuid();
                const template = `<?xml version="1.0"?><Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"><Product Id="${product}" Name="Trier Preservation Test ${product}" UpgradeCode="${upgrade}" Version="1.0.0" Language="1033" Manufacturer="IsolatedTest"><Package Compressed="yes" InstallerVersion="500" InstallScope="perUser"/><MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="Newer version installed"/><MediaTemplate EmbedCab="yes"/><Directory Id="TARGETDIR" Name="SourceDir"><Directory Id="LocalAppDataFolder"><Directory Id="APPLICATIONFOLDER" Name="PreservationFixture"/></Directory></Directory><Feature Id="Main"><ComponentGroupRef Id="ProductComponents"/></Feature><ComponentGroup Id="ProductComponents" Directory="APPLICATIONFOLDER"><Component Id="Program" Guid="${uuid()}" Win64="yes"><File Source="${payload}" KeyPath="yes"/></Component><Component Id="Inventory" Guid="${uuid()}" Win64="yes"><File Source="${inventory}" KeyPath="yes"/></Component></ComponentGroup></Product></Wix>`;
                const transformed = require('../../electron/msi-preservation').transform(template.replace(`<File Source="${payload}"`, `<File Id="mainExecutable" Source="${payload}"`).replace('</Product>', '<CustomAction Id="InjectedFailure" Error="Intentional isolated upgrade failure"/><InstallExecuteSequence><Custom Action="InjectedFailure" After="InstallExecute">FAIL_AFTER_PREPARE</Custom></InstallExecuteSequence></Product>'), {
                    stateRoot: state, impersonate: 'yes', registryRoot: 'HKCU', registryKey: key + '\\msi',
                });
                const wxs = path.join(base, 'test.wxs');
                write(wxs, transformed);
                run(path.join(wix, 'candle.exe'), ['-nologo', '-arch', 'x64', '-out', path.join(base, 'test.wixobj'), wxs]);
                run(path.join(wix, 'light.exe'), ['-nologo', '-sval', '-out', packageFile, path.join(base, 'test.wixobj')]);
                const installMsi = (file, name, args = [], explicitPath = true) => run('msiexec.exe', ['/i', file, '/qn', '/norestart', ...(explicitPath ? [`APPLICATIONFOLDER=${install}`] : []), '/L*v', path.join(base, name + '.log'), ...args]);
                installMsi(packageFile, 'install');
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual MSI legacy-data adoption');
                installMsi(packageFile, 'reinstall', ['REINSTALL=ALL', 'REINSTALLMODE=amus']);
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual MSI same-package repair/reinstall');
                const failed = require('node:child_process').spawnSync('msiexec.exe', ['/i', packageFile, '/qn', '/norestart', 'REINSTALL=ALL', 'REINSTALLMODE=amus', 'FAIL_AFTER_PREPARE=1', `APPLICATIONFOLDER=${install}`, '/L*v', path.join(base, 'failed-upgrade.log')], { timeout: 180000, windowsHide: true });
                assert.equal(failed.status, 1603);
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                assert.ok(!fs.existsSync(path.join(state, 'maintenance.json')));
                pass('Actual MSI failed upgrade rolls back and retains data');
                let currentProduct = product;
                let currentPackage = packageFile;
                // Reproduce legacy MSI installs without a retained directory key.
                run('reg.exe', ['delete', 'HKCU\\' + key + '\\msi', '/f']);
                for (const [label, version] of [['newer-version', '1.1.0'], ['same-version-new-package', '1.1.0']]) {
                    currentProduct = uuid(); products.push(currentProduct);
                    currentPackage = path.join(base, label + '.msi');
                    const nextWxs = path.join(base, label + '.wxs');
                    const nextObj = path.join(base, label + '.wixobj');
                    write(nextWxs, transformed.replace(`Product Id="${product}"`, `Product Id="${currentProduct}"`).replace('Version="1.0.0"', `Version="${version}"`));
                    run(path.join(wix, 'candle.exe'), ['-nologo', '-arch', 'x64', '-out', nextObj, nextWxs]);
                    run(path.join(wix, 'light.exe'), ['-nologo', '-sval', '-out', currentPackage, nextObj]);
                    installMsi(currentPackage, label, [], false);
                    assert.deepEqual(snapshot(manifest().DataDir), expected);
                    pass('Actual MSI ' + label + ' upgrade removes previous package safely');
                }
                run('msiexec.exe', ['/x', '{' + currentProduct + '}', '/qn', '/norestart', '/L*v', path.join(base, 'uninstall.log')]);
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual MSI uninstall retains data');
                installMsi(currentPackage, 'retained-reinstall');
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual MSI retained-data reinstall');
                run('msiexec.exe', ['/x', '{' + currentProduct + '}', '/qn', '/norestart', '/L*v', path.join(base, 'cleanup.log')]);
            } else {
                assert.ok(path.resolve(install).startsWith(path.resolve(root) + path.sep), 'Destructive legacy simulation must remain inside the generated test root');
                const nsi = path.join(base, 'test.nsi');
                write(nsi, `Unicode true
!include "LogicLib.nsh"
!include "FileFunc.nsh"
Name "Isolated Preservation Test"
OutFile "${packageFile}"
RequestExecutionLevel user
SilentInstall silent
InstallDir "${install}"
Var hasPerMachineInstallation
Var hasPerUserInstallation
!define PROJECT_DIR "${repo}"
!define TRIER_STATE_ARGUMENT '-StateRoot "${state}"'
!define TRIER_REGISTRY_ROOT HKCU
!define TRIER_REGISTRY_KEY "${key}\\nsis"
!define UNINSTALL_FILENAME "Uninstall-Test.exe"
!include "${path.join(repo, 'electron/installer.nsh')}"
!insertmacro customHeader
Section "Install"
  # Simulate the legacy electron-builder uninstaller which recursively erased
  # the old tree. This fixture's literal INSTDIR is generated under TEMP only.
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File "${payload}"
  File "${inventory}"
  WriteUninstaller "$INSTDIR\\Uninstall-Test.exe"
  !insertmacro customInstall
SectionEnd
Function .onInit
  !insertmacro customInit
FunctionEnd
Function un.onInit
  !insertmacro customUnInit
FunctionEnd
Section "Uninstall"
  !insertmacro customRemoveFiles
SectionEnd
`);
                run(nsis, ['/V2', nsi]);
                for (const scenario of ['legacy upgrade', 'same-version reinstall']) {
                    run(packageFile, ['/S']);
                    assert.deepEqual(snapshot(manifest().DataDir), expected);
                    pass('Actual NSIS ' + scenario);
                }
                // _?= prevents NSIS from copying to TEMP and returning before its
                // uninstaller finishes, making the result synchronous to the test.
                run(path.join(install, 'Uninstall-Test.exe'), ['/S', '_?=' + install]);
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual NSIS uninstall retains data');
                run(packageFile, ['/S']);
                assert.deepEqual(snapshot(manifest().DataDir), expected);
                pass('Actual NSIS retained-data reinstall');
            }
        }
    } finally {
        for (const product of products) require('node:child_process').spawnSync('msiexec.exe', ['/x', '{' + product + '}', '/qn', '/norestart'], { timeout: 180000, windowsHide: true });
        // Exact test-only key created above. Never touch production identifiers.
        require('node:child_process').spawnSync('reg.exe', ['delete', 'HKCU\\' + key, '/f'], { windowsHide: true });
    }
}
module.exports = { testPackages };
