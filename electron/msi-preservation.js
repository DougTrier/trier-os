// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Windows Installer preservation actions. Preparation runs before the previous
 * MSI removes files; rollback is scheduled before preparation and runs last.
 * msiProjectCreated(project): injects the same offline helper used by NSIS.
 * No HTTP routes. The persistent registry locator deliberately survives removal.
 */
const fs = require('node:fs');
const path = require('node:path');
const xml = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function transform(source, { stateRoot = '[CommonAppDataFolder]TrierOS', impersonate = 'no', registryRoot = 'HKLM', registryKey = 'Software\\TrierOS\\Persistence' } = {}) {
    if (source.includes('TrPrepare')) throw new Error('Preservation actions already installed');
    if (!source.includes('<MajorUpgrade ') || !source.includes('</Product>')) throw new Error('Unrecognized MSI template');
    source = source.replace('<MajorUpgrade ', '<MajorUpgrade Schedule="afterInstallExecute" ');
    const helper = fs.readFileSync(path.join(__dirname, 'preserve-data.ps1'), 'utf8');
    const scriptsDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'trier-msi-hooks-'));
    const upgradeCode = source.match(/UpgradeCode="([^"]+)"/)[1];
    const actions = [
        ['TrRollback', 'Rollback', 'rollback'], ['TrPrepare', 'Prepare', 'deferred'],
        ['TrCommit', 'Commit', 'deferred'], ['TrComplete', 'Complete', 'commit'],
        ['TrReconnect', 'Reconnect', 'rollback'], ['TrDetach', 'Detach', 'deferred'],
    ];
    let declarations = '';
    let sequence = '';
    for (const [id, action, execute] of actions) {
        const removing = id === 'TrDetach' || id === 'TrReconnect';
        const condition = removing ? 'REMOVE~="ALL"' : 'NOT (REMOVE~="ALL")';
        // Inline script is embedded in the MSI Binary/CustomAction tables, so it
        // remains available during cached-package uninstall and rollback.
        const script = `function main() {
  var args = Session.Property("CustomActionData").split("|");
  if (args.length !== 3 || /["\\r\\n]/.test(args[0] + args[1]) || !/^S-1-[0-9-]+$/.test(args[2])) return 3;
  args[0] = args[0].replace(/[\\\\/]+$/, "");
  args[1] = args[1].replace(/[\\\\/]+$/, "");
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  var folder = fso.BuildPath(fso.GetSpecialFolder(2), fso.GetTempName());
  fso.CreateFolder(folder);
  var file = fso.BuildPath(folder, "preserve.ps1");
  var stream = fso.CreateTextFile(file, false, true);
  stream.Write(${JSON.stringify(helper)});
  stream.Close();
  var shell = new ActiveXObject("WScript.Shell");
  var exe = shell.ExpandEnvironmentStrings("%SystemRoot%") + "\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe";
  var errorLog = file + ".error.txt";
  var command = '"' + exe + '" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + file + '" -Action ${action}${id === 'TrCommit' ? ' -KeepPending' : ''} -PackageKind MSI -InstallDir "' + args[0] + '" -StateRoot "' + args[1] + '" -RuntimeUserSid "' + args[2] + '" -ErrorLog "' + errorLog + '"';
  // Window style 0 hides the process from creation; Exec + WindowStyle Hidden
  // only hid it after startup and caused distracting console flashes.
  var result = shell.Run(command, 0, true);
  var output = "Preservation helper failed with exit code " + result;
  if (fso.FileExists(errorLog)) {
    var log = fso.OpenTextFile(errorLog, 1, false, -1);
    output = log.ReadAll(); log.Close(); fso.DeleteFile(errorLog);
  }
  fso.DeleteFile(file); fso.DeleteFolder(folder);
  if (result !== 0) throw new Error(output.substring(0, 3000));
  return result === 0 ? 1 : 3;
}`;
        // Binary-backed scripts are not MSI formatted strings. Inline Script
        // custom actions would interpret PowerShell's [Type] syntax as MSI
        // properties and silently corrupt the helper before execution.
        const scriptPath = path.join(scriptsDir, id + '.js');
        fs.writeFileSync(scriptPath, '// Copyright © 2026 Doug Trier\n// SPDX-License-Identifier: MIT\n// See root LICENSE. Generated installer lifecycle action; no HTTP API.\n' + script);
        declarations += `<Binary Id="${id}Script" SourceFile="${xml(scriptPath)}"/>\n`;
        declarations += `<CustomAction Id="${id}" BinaryKey="${id}Script" JScriptCall="main" Execute="${execute}" Impersonate="${impersonate}" Return="check"/>\n`;
        declarations += `<CustomAction Id="Set${id}" Property="${id}" Value="[APPLICATIONFOLDER]|${xml(stateRoot)}|[UserSID]"/>\n`;
        sequence += `<Custom Action="Set${id}" Before="InstallInitialize"><![CDATA[${condition}]]></Custom>\n`;
    }
    sequence += `
      <Custom Action="TrRollback" After="InstallInitialize">NOT (REMOVE~="ALL")</Custom>
      <Custom Action="TrPrepare" After="TrRollback">NOT (REMOVE~="ALL")</Custom>
      <Custom Action="TrCommit" After="RemoveExistingProducts">NOT (REMOVE~="ALL")</Custom>
      <Custom Action="TrComplete" After="TrCommit">NOT (REMOVE~="ALL")</Custom>
      <Custom Action="TrReconnect" Before="RemoveFiles">REMOVE~="ALL"</Custom>
      <Custom Action="TrDetach" After="TrReconnect">REMOVE~="ALL"</Custom>`;
    // Legacy MSIs did not reliably write ARPINSTALLLOCATION. Resolve their main
    // executable component through Windows Installer before choosing a folder.
    const discoverPath = path.join(scriptsDir, 'discover.js');
    fs.writeFileSync(discoverPath, `// Copyright © 2026 Doug Trier. MIT License; see root LICENSE.
// Existing MSI directory discovery; no HTTP routes or database writes.
function main() {
  if (Session.Property("TRIER_PREVIOUS_DIR")) return 1;
  var products = new Enumerator(Session.Installer.RelatedProducts("{${upgradeCode.replace(/[{}]/g, '')}}"));
  for (; !products.atEnd(); products.moveNext()) {
    var product = products.item();
    var cache = Session.Installer.ProductInfo(product, "LocalPackage");
    var database = Session.Installer.OpenDatabase(cache, 0);
    var query = database.OpenView("SELECT Component.ComponentId FROM Component, File WHERE File.Component_ = Component.Component AND File.File = 'mainExecutable'");
    query.Execute();
    var row = query.Fetch();
    if (row) {
      var exe = Session.Installer.ComponentPath(product, row.StringData(1));
      if (exe) Session.Property("TRIER_PREVIOUS_DIR") = new ActiveXObject("Scripting.FileSystemObject").GetParentFolderName(exe);
    }
    query.Close();
  }
  return 1;
}`);
    const locator = `
      <Property Id="TRIER_PREVIOUS_DIR"><RegistrySearch Id="TrierExistingStorage" Root="${registryRoot}" Key="${xml(registryKey)}" Name="InstallDir" Type="raw" Win64="yes"/></Property>
      <Binary Id="TrierDiscoverScript" SourceFile="${xml(discoverPath)}"/>
      <CustomAction Id="TrierDiscoverDirectory" BinaryKey="TrierDiscoverScript" JScriptCall="main" Return="check"/>
      <CustomAction Id="TrierReuseDirectory" Property="APPLICATIONFOLDER" Value="[TRIER_PREVIOUS_DIR]"/>
      <InstallExecuteSequence><Custom Action="TrierDiscoverDirectory" Before="TrierReuseDirectory">NOT Installed</Custom><Custom Action="TrierReuseDirectory" Before="CostFinalize">TRIER_PREVIOUS_DIR</Custom></InstallExecuteSequence>
      <InstallUISequence><Custom Action="TrierDiscoverDirectory" Before="TrierReuseDirectory">NOT Installed</Custom><Custom Action="TrierReuseDirectory" Before="CostFinalize">TRIER_PREVIOUS_DIR</Custom></InstallUISequence>
      <DirectoryRef Id="APPLICATIONFOLDER"><Component Id="TrierRetainedLocator" Guid="*" Win64="yes" Permanent="yes" NeverOverwrite="yes"><RegistryValue Root="${registryRoot}" Key="${xml(registryKey)}" Name="InstallDir" Value="[APPLICATIONFOLDER]" Type="string" KeyPath="yes"/></Component></DirectoryRef>
    `;
    source = source.replace('<ComponentGroupRef Id="ProductComponents"/>', '<ComponentGroupRef Id="ProductComponents"/><ComponentRef Id="TrierRetainedLocator"/>');
    return source.replace('</Product>', `${locator}${declarations}<InstallExecuteSequence>${sequence}</InstallExecuteSequence></Product>`);
}
module.exports = async project => fs.writeFileSync(project, transform(fs.readFileSync(project, 'utf8')));
module.exports.transform = transform;
