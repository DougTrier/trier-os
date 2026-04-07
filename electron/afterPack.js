// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * electron-builder afterPack hook
 * 
 * Fixes missing transitive dependencies that electron-builder's
 * dependency pruning incorrectly excludes from the packaged app.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
    const appDir = context.packager.getResourcesDir(context.appOutDir);
    const appNodeModules = path.join(appDir, 'app', 'node_modules');
    const sourceNodeModules = path.join(context.packager.projectDir, 'node_modules');

    console.log('  • afterPack: Checking for missing dependencies...');

    // Walk through ALL packages in source node_modules
    // and check if any production transitive deps are missing
    let fixCount = 0;

    const sourcePackages = fs.readdirSync(sourceNodeModules).filter(name => {
        return !name.startsWith('.') && fs.statSync(path.join(sourceNodeModules, name)).isDirectory();
    });

    for (const pkgName of sourcePackages) {
        const srcPkgPath = path.join(sourceNodeModules, pkgName);
        const dstPkgPath = path.join(appNodeModules, pkgName);

        // Skip if already present in packaged app
        if (fs.existsSync(dstPkgPath)) continue;

        // Check if any PACKAGED module depends on this missing one
        const isNeeded = isNeededByPackaged(pkgName, appNodeModules, sourceNodeModules);
        if (isNeeded) {
            console.log(`  • afterPack: Copying missing dep: ${pkgName}`);
            copyDirSync(srcPkgPath, dstPkgPath);
            fixCount++;
        }
    }

    // Also handle scoped packages (@scope/name)
    for (const item of sourcePackages) {
        if (item.startsWith('@')) {
            const scopeDir = path.join(sourceNodeModules, item);
            const scopedPkgs = fs.readdirSync(scopeDir).filter(name => {
                return fs.statSync(path.join(scopeDir, name)).isDirectory();
            });
            for (const scopedName of scopedPkgs) {
                const fullName = `${item}/${scopedName}`;
                const srcPkgPath = path.join(sourceNodeModules, item, scopedName);
                const dstPkgPath = path.join(appNodeModules, item, scopedName);
                if (!fs.existsSync(dstPkgPath)) {
                    const isNeeded = isNeededByPackaged(fullName, appNodeModules, sourceNodeModules);
                    if (isNeeded) {
                        console.log(`  • afterPack: Copying missing dep: ${fullName}`);
                        fs.mkdirSync(path.join(appNodeModules, item), { recursive: true });
                        copyDirSync(srcPkgPath, dstPkgPath);
                        fixCount++;
                    }
                }
            }
        }
    }

    if (fixCount > 0) {
        console.log(`  • afterPack: Fixed ${fixCount} missing dependencies`);
    } else {
        console.log('  • afterPack: All dependencies present - no fixes needed');
    }
};

function isNeededByPackaged(pkgName, appNodeModules, sourceNodeModules) {
    // Check if any package in the packaged node_modules depends on pkgName
    try {
        const packagedDirs = fs.readdirSync(appNodeModules).filter(name => {
            const fullPath = path.join(appNodeModules, name);
            return !name.startsWith('.') && fs.statSync(fullPath).isDirectory();
        });

        for (const dir of packagedDirs) {
            try {
                const pkgJsonPath = path.join(appNodeModules, dir, 'package.json');
                if (!fs.existsSync(pkgJsonPath)) continue;
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
                const deps = pkgJson.dependencies || {};
                if (deps[pkgName]) return true;
            } catch (e) { /* skip */ }

            // Check scoped packages inside this dir
            if (dir.startsWith('@')) {
                try {
                    const scopeDir = path.join(appNodeModules, dir);
                    const scopedPkgs = fs.readdirSync(scopeDir);
                    for (const sp of scopedPkgs) {
                        try {
                            const spJsonPath = path.join(scopeDir, sp, 'package.json');
                            if (!fs.existsSync(spJsonPath)) continue;
                            const spJson = JSON.parse(fs.readFileSync(spJsonPath, 'utf8'));
                            const deps = spJson.dependencies || {};
                            if (deps[pkgName]) return true;
                        } catch (e) { /* skip */ }
                    }
                } catch (e) { /* skip */ }
            }
        }
    } catch (e) { /* skip */ }
    return false;
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
