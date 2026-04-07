// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS � Electron Main Process (Fully Embedded Server)
 * 
 * This builds as a completely self-contained desktop application:
 *   - Starts the Express/Node.js server INTERNALLY as a child process
 *   - Waits for the server to be ready, then loads it in BrowserWindow
 *   - Bundles everything: frontend, server, databases, node_modules
 *   - Desktop icon, system tray, minimize-to-tray behavior
 * 
 * Result: Double-click �  Install �  Open �  Application ready.
 * 
 * Usage:
 *   Development:  npm run electron:dev   (connects to external Vite dev server)
 *   Production:   npm run electron:start (embeds server internally)
 *   Package:      npm run electron:build (creates .exe and .msi installers)
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ���� Configuration ��������������������������������������������������������������������������������������������������������������������
const IS_DEV = process.env.ELECTRON_DEV === 'true';
const SERVER_PORT = process.env.PORT || 3000;
const HTTPS_PORT  = parseInt(process.env.HTTPS_PORT || '1938');
const DEV_URL = 'http://localhost:5173';
const EMBEDDED_URL = `http://localhost:${SERVER_PORT}`;   // health-check polling only
const APP_URL      = `https://localhost:${HTTPS_PORT}`;    // what BrowserWindow loads

// App data paths
const APP_DATA_DIR = path.join(app.getPath('userData'), 'TrierOS');
const CONFIG_PATH = path.join(APP_DATA_DIR, 'config.json');
const LOG_PATH = path.join(APP_DATA_DIR, 'logs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let syncInterval = null;

// ���� Resolve paths for packaged vs development ����
function isPackaged() {
    // When packaged by electron-builder, app.isPackaged is true
    return app.isPackaged && !IS_DEV;
}

function getAppRoot() {
    if (isPackaged()) {
        // Packaged: files are at resources/app/ (asar disabled)
        return path.join(process.resourcesPath, 'app');
    }
    // Development: project root is one level up from electron/
    return path.join(__dirname, '..');
}

function getDataDir() {
    if (isPackaged()) {
        // Packaged: databases are in resources/data/ (from extraResources)
        return path.join(process.resourcesPath, 'data');
    }
    // Development: data/ is at project root
    return path.join(__dirname, '..', 'data');
}

function getServerPath() {
    const root = getAppRoot();
    return path.join(root, 'server', 'index.js');
}

// ���� Ensure app data directories exist ����
function ensureDirectories() {
    [APP_DATA_DIR, LOG_PATH].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

// ���� Load or create configuration ����
function loadConfig() {
    const defaults = {
        serverPort: SERVER_PORT,
        syncIntervalSeconds: 30,
        lastSyncTimestamp: null,
        plantId: null,
        authToken: null,
        username: null,
        windowBounds: { width: 1400, height: 900 }
    };

    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            return { ...defaults, ...saved };
        }
    } catch (e) {
        console.error('[CONFIG] Failed to load config:', e.message);
    }
    return defaults;
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('[CONFIG] Failed to save config:', e.message);
    }
}

// ���� Start Embedded Server ����������������������������������������������������������������������������������������������������
let serverErrors = []; // Collect server errors for diagnostics

function startEmbeddedServer() {
    return new Promise((resolve, reject) => {
        const serverScript = getServerPath();
        const dataDir = getDataDir();
        const appRoot = getAppRoot();
        serverErrors = [];
        
        // Write a startup diagnostics file to Desktop for debugging
        const desktopPath = path.join(app.getPath('home'), 'Desktop', 'TrierOS_startup.log');
        const diagLog = (msg) => {
            const line = `[${new Date().toISOString()}] ${msg}\n`;
            try { fs.appendFileSync(desktopPath, line); } catch(e) {}
            console.log(msg);
        };

        diagLog(`[STARTUP] App root: ${appRoot}`);
        diagLog(`[STARTUP] Server script: ${serverScript}`);
        diagLog(`[STARTUP] Data dir: ${dataDir}`);
        diagLog(`[STARTUP] Server script exists: ${fs.existsSync(serverScript)}`);
        diagLog(`[STARTUP] process.execPath: ${process.execPath}`);
        diagLog(`[STARTUP] process.resourcesPath: ${process.resourcesPath}`);
        diagLog(`[STARTUP] app.isPackaged: ${app.isPackaged}`);
        
        if (!fs.existsSync(serverScript)) {
            const errMsg = `Server not found: ${serverScript}`;
            diagLog(`[STARTUP ERROR] ${errMsg}`);
            reject(new Error(errMsg));
            return;
        }

        // Check if better-sqlite3 native module exists
        const sqlite3Path = path.join(appRoot, 'node_modules', 'better-sqlite3');
        const sqlite3Exists = fs.existsSync(sqlite3Path);
        diagLog(`[STARTUP] better-sqlite3 exists: ${sqlite3Exists}`);
        if (sqlite3Exists) {
            try {
                const buildDir = path.join(sqlite3Path, 'build', 'Release');
                const files = fs.existsSync(buildDir) ? fs.readdirSync(buildDir) : [];
                diagLog(`[STARTUP] better-sqlite3 build/Release files: ${JSON.stringify(files)}`);
            } catch(e) {
                diagLog(`[STARTUP] Could not read better-sqlite3 build dir: ${e.message}`);
            }
        }

        diagLog('[STARTUP] Spawning server process...');

        // Start the server as a child process
        // ELECTRON_RUN_AS_NODE=1 makes the child process behave as plain Node.js
        // Without this, the packaged Electron exe ignores the script argument and re-runs main.js
        
        // Generate or load a persistent JWT secret for the embedded server
        let jwtSecret;
        try {
            const configFile = path.join(APP_DATA_DIR, 'config.json');
            if (fs.existsSync(configFile)) {
                const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                jwtSecret = config.jwtSecret;
            }
            if (!jwtSecret) {
                // Generate a cryptographically secure secret on first launch
                const crypto = require('crypto');
                jwtSecret = crypto.randomBytes(32).toString('hex');
                const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
                config.jwtSecret = jwtSecret;
                fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
                diagLog(`[STARTUP] Generated new JWT secret and saved to config`);
            }
        } catch (e) {
            // Fallback: use a static secret if config file fails
            jwtSecret = 'trier-os-embedded-desktop-secret-' + Date.now();
            diagLog(`[STARTUP] JWT secret fallback used: ${e.message}`);
        }

        const env = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            PORT: String(SERVER_PORT),
            HTTPS_PORT: String(HTTPS_PORT),
            NODE_ENV: 'production',
            DEMO_MODE: 'true',
            ELECTRON_EMBEDDED: 'true',
            DATA_DIR: dataDir,
            JWT_SECRET: jwtSecret
        };

        serverProcess = spawn(process.execPath, [serverScript], {
            cwd: appRoot,
            env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Log server output
        const logFile = path.join(LOG_PATH, `server-${new Date().toISOString().split('T')[0]}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        serverProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log('[SERVER]', msg.trim());
            logStream.write(`[${new Date().toISOString()}] ${msg}`);
            diagLog(`[SERVER OUT] ${msg.trim()}`);
        });

        serverProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            console.error('[SERVER ERR]', msg.trim());
            logStream.write(`[ERROR ${new Date().toISOString()}] ${msg}`);
            diagLog(`[SERVER ERR] ${msg.trim()}`);
            serverErrors.push(msg.trim());
        });

        serverProcess.on('error', (err) => {
            diagLog(`[SERVER SPAWN ERROR] ${err.message}`);
            reject(err);
        });

        serverProcess.on('exit', (code) => {
            diagLog(`[SERVER EXIT] code: ${code}`);
            console.log('[SERVER] Process exited with code:', code);
            serverProcess = null;
        });

        // Poll until server is ready (max 60 seconds)
        let attempts = 0;
        const maxAttempts = 120;
        const checkInterval = setInterval(() => {
            attempts++;
            
            // If server process already exited, fail immediately
            if (!serverProcess) {
                clearInterval(checkInterval);
                const errDetail = serverErrors.join('\n').substring(0, 2000);
                diagLog(`[STARTUP FAIL] Server exited before becoming ready`);
                reject(new Error(`Server crashed on startup:\n${errDetail}`));
                return;
            }
            
            const req = http.get(`${EMBEDDED_URL}/api/ping`, (res) => {
                if (res.statusCode === 200) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            if (data.ready) {
                                clearInterval(checkInterval);
                                diagLog(`[STARTUP OK] Server fully ready after ${attempts * 500}ms`);
                                resolve();
                            } else {
                                diagLog(`[STARTUP] Ping OK but server not fully ready yet (attempt ${attempts})`);
                            }
                        } catch (e) {
                            // JSON parse fail � treat as not ready
                        }
                    });
                }
            });

            req.on('error', () => {
                // Server not ready yet
                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    const errDetail = serverErrors.join('\n').substring(0, 2000);
                    diagLog(`[STARTUP FAIL] Timeout after 60s. Errors:\n${errDetail}`);
                    reject(new Error(`Server failed to start within 60 seconds.\n\nServer output:\n${errDetail}`));
                }
            });

            req.setTimeout(400);
            req.on('timeout', () => req.destroy());
        }, 500);
    });
}

function stopEmbeddedServer() {
    if (serverProcess) {
        console.log('[SERVER] Shutting down embedded server...');
        serverProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds if it doesn't quit gracefully
        setTimeout(() => {
            if (serverProcess) {
                console.log('[SERVER] Force killing server process');
                serverProcess.kill('SIGKILL');
            }
        }, 5000);
    }
}

// ���� Create Main Window ����������������������������������������������������������������������������������������������������������
function createWindow() {
    const config = loadConfig();
    const bounds = config.windowBounds || { width: 1400, height: 900 };

    mainWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth: 800,
        minHeight: 600,
        title: 'Trier OS',
        icon: getAppIcon(),
        backgroundColor: '#0f172a',
        show: false, // Show after ready
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // Load content
    if (IS_DEV) {
        console.log('[ELECTRON] Loading dev server:', DEV_URL);
        mainWindow.loadURL(DEV_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // Production � load from embedded server
        console.log('[ELECTRON] Loading from embedded server:', EMBEDDED_URL);
        mainWindow.loadURL(EMBEDDED_URL);
    }

    // Show when ready (smooth, no white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Save window bounds on move/resize
    ['resize', 'move'].forEach(event => {
        mainWindow.on(event, () => {
            if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
                const config = loadConfig();
                config.windowBounds = mainWindow.getBounds();
                saveConfig(config);
            }
        });
    });

    // Handle window close � minimize to tray instead
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            if (tray) {
                tray.displayBalloon({
                    title: 'Trier OS',
                    content: 'Running in background. Server continues automatically.',
                    iconType: 'info'
                });
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ���� System Tray ������������������������������������������������������������������������������������������������������������������������
function createTray() {
    const icon = getAppIcon();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Open Trier OS', 
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createWindow();
                }
            }
        },
        { type: 'separator' },
        { 
            label: 'Server: Running',
            id: 'server-status',
            enabled: false
        },
        { 
            label: `Port: ${SERVER_PORT}`,
            id: 'server-port',
            enabled: false
        },
        { type: 'separator' },
        { 
            label: 'Open in Browser',
            click: () => {
                const { shell } = require('electron');
                shell.openExternal(EMBEDDED_URL);
            }
        },
        { type: 'separator' },
        { 
            label: 'Quit Trier OS',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Trier OS � Running');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function getAppIcon() {
    // Prefer .ico on Windows, .png elsewhere
    const icoPath = path.join(__dirname, 'icons', 'icon.ico');
    const pngPath = path.join(__dirname, 'icons', 'icon-512.png');
    const fallbackPath = path.join(__dirname, '..', 'public', 'assets', 'TrierLogo.png');
    
    if (process.platform === 'win32' && fs.existsSync(icoPath)) {
        return nativeImage.createFromPath(icoPath);
    }
    if (fs.existsSync(pngPath)) {
        return nativeImage.createFromPath(pngPath);
    }
    if (fs.existsSync(fallbackPath)) {
        return nativeImage.createFromPath(fallbackPath);
    }
    return nativeImage.createEmpty();
}

// ���� IPC Handlers (Renderer �  Main) ����������������������������������������������������������������������������������
function setupIPC() {
    // Get app info
    ipcMain.handle('get-app-info', () => ({
        version: app.getVersion(),
        dataPath: APP_DATA_DIR,
        platform: process.platform,
        isDev: IS_DEV,
        serverPort: SERVER_PORT
    }));

    // Get/set config
    ipcMain.handle('get-config', () => loadConfig());
    ipcMain.handle('save-config', (event, config) => {
        saveConfig(config);
        return { success: true };
    });

    // Show native notification
    ipcMain.on('show-notification', (event, { title, body }) => {
        if (tray) {
            tray.displayBalloon({ title, content: body, iconType: 'info' });
        }
    });

    // Open external link
    ipcMain.handle('open-external', (event, url) => {
        const { shell } = require('electron');
        return shell.openExternal(url);
    });

    // Print to PDF � generates a PDF from the current page and opens it in the system viewer
    ipcMain.handle('print-to-pdf', async (event) => {
        try {
            if (!mainWindow) return { success: false, error: 'No window available' };
            const pdfData = await mainWindow.webContents.printToPDF({
                printBackground: true,
                landscape: false,
                marginsType: 0,
                pageSize: 'Letter'
            });
            // Save to temp file
            const os = require('os');
            const tempDir = os.tmpdir();
            const fileName = `TrierOS_Print_${Date.now()}.pdf`;
            const filePath = path.join(tempDir, fileName);
            fs.writeFileSync(filePath, pdfData);
            // Open with system default PDF viewer
            const { shell } = require('electron');
            await shell.openPath(filePath);
            return { success: true, path: filePath };
        } catch (err) {
            console.error('[PRINT-PDF] Error:', err.message);
            return { success: false, error: err.message };
        }
    });
}

// ���� App Lifecycle ��������������������������������������������������������������������������������������������������������������������
// Accept self-signed cert for the embedded local HTTPS server only
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith(`https://localhost:${HTTPS_PORT}`) ||
        url.startsWith(`https://127.0.0.1:${HTTPS_PORT}`)) {
        event.preventDefault();
        callback(true); // trust embedded server's self-signed cert
    } else {
        callback(false);
    }
});

app.whenReady().then(async () => {
    ensureDirectories();
    setupIPC();

    // In production mode, start the embedded server first
    if (!IS_DEV) {
        try {
            console.log('[ELECTRON] Starting embedded server...');
            await startEmbeddedServer();
            console.log('[ELECTRON] �S& Server started successfully');
        } catch (err) {
            console.error('[ELECTRON] �R Failed to start server:', err.message);
            dialog.showErrorBox(
                'Trier OS � Server Error',
                `The embedded server failed to start:\n\n${err.message}\n\nPlease check the logs in:\n${LOG_PATH}`
            );
            app.quit();
            return;
        }
    }

    createWindow();
    createTray();

    // macOS: re-create window when dock icon clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
        }
    });

    console.log('[ELECTRON] Trier OS Desktop started');
    console.log('[ELECTRON] Data directory:', APP_DATA_DIR);
    console.log('[ELECTRON] Mode:', IS_DEV ? 'Development' : 'Production (embedded server)');
});

// Prevent app from quitting when all windows closed (lives in tray)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Don't quit � keep running in tray
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
    
    // Stop embedded server
    stopEmbeddedServer();
    
    // Clean up sync interval
    if (syncInterval) {
        clearInterval(syncInterval);
    }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // Focus existing window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
