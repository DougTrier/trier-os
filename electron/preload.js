// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS � Electron Preload Script
 * 
 * Exposes a safe IPC bridge between the renderer (React app) and 
 * the main process. Uses contextBridge to prevent direct Node.js access.
 * 
 * The renderer can access these via `window.TrierOS`
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TrierOS', {
    // ���� App Info ����
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    isElectron: true,

    // ���� Configuration ����
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),

    // ���� Tray Status ����
    updateTrayStatus: (status, pendingCount, lastSync) => {
        ipcRenderer.send('update-tray-status', { status, pendingCount, lastSync });
    },

    // ���� Notifications ����
    showNotification: (title, body) => {
        ipcRenderer.send('show-notification', { title, body });
    },

    // ���� External Links ����
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // ���� Print to PDF ����
    printToPDF: () => ipcRenderer.invoke('print-to-pdf'),

    // ���� Database ����
    getDbPath: () => ipcRenderer.invoke('get-db-path'),

    // ���� Sync Events (Main �  Renderer) ����
    onForceSync: (callback) => {
        ipcRenderer.on('force-sync', () => callback());
        return () => ipcRenderer.removeAllListeners('force-sync');
    },

    onSyncComplete: (callback) => {
        ipcRenderer.on('sync-complete', (event, result) => callback(result));
        return () => ipcRenderer.removeAllListeners('sync-complete');
    },

    // ���� Platform Info ����
    platform: process.platform, // 'win32' | 'darwin' | 'linux'
    arch: process.arch,
    version: process.versions.electron
});

// Log preload completion
console.log('[PRELOAD] Trier OS bridge initialized');
console.log('[PRELOAD] Platform:', process.platform, process.arch);
