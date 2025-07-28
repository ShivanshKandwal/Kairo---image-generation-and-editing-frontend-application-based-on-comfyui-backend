// File: preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    saveImage: (data) => ipcRenderer.invoke('save-image', data),
    getKeywords: () => ipcRenderer.invoke('keywords:get'),
    saveKeywords: (keywords) => ipcRenderer.invoke('keywords:save', keywords),
    
    // Gallery Functions
    saveToGallery: (data) => ipcRenderer.invoke('gallery:save', data),
    getGallery: () => ipcRenderer.invoke('gallery:get'),
    deleteFromGallery: (id) => ipcRenderer.invoke('gallery:delete', id),
    clearGallery: () => ipcRenderer.invoke('gallery:clear'),
    openImageFolder: (filename) => ipcRenderer.send('gallery:open-folder', filename)
});

contextBridge.exposeInMainWorld('comfyAPI', {
    // This is now the ONLY channel needed for logs.
    onStatusUpdate: (callback) => ipcRenderer.on('comfyui-status-update', (_event, value) => callback(value)),

    // NEW: Signal to the main process that the renderer is ready to receive logs.
    rendererReadyForLogs: () => ipcRenderer.send('renderer-ready-for-logs'),
    
    getAvailableModels: () => ipcRenderer.invoke('get-available-models'),
    interruptGeneration: () => ipcRenderer.invoke('interrupt-generation'),
    getHostIp: () => ipcRenderer.invoke('get-host-ip'),
    getHostname: () => ipcRenderer.invoke('get-hostname'),
    setHostname: (hostname) => ipcRenderer.invoke('set-hostname', hostname),
    selectComfyUIPath: () => ipcRenderer.invoke('select-comfyui-path'),
    getDefaultModel: () => ipcRenderer.invoke('get-default-model'),
    setDefaultModel: (modelName) => ipcRenderer.invoke('set-default-model', modelName)
});
