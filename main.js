const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const axios = require("axios");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const BonjourService = require("bonjour-service");
let store; 
let db; 
let comfyProcess;
let mainWindow;
let bonjour;
const FRONTEND_PORT = 7860;
const BACKEND_PORT = 8188;
let ipAddressUpdateInterval;
let ipAddressFilePath;
let rendererReady = false;
const logBuffer = [];

const IS_PACKAGED = app.isPackaged;
const UNPACKED_PATH_BASE = IS_PACKAGED
  ? path.join(process.resourcesPath, "app.asar.unpacked")
  : __dirname;
const FRONTEND_PATH = path.join(UNPACKED_PATH_BASE, "Frontend");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
let COMFYUI_PATH; 

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const wifiInterface = interfaces["Wi-Fi"];
  if (wifiInterface) {
    for (const net of wifiInterface) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}
function cleanupLingeringProcesses() {
  return new Promise((resolve) => {
    const command = `netstat -aon | findstr ":${BACKEND_PORT}"`;
    exec(command, (err, stdout) => {
      if (err) return resolve();
      const pidsToKill = new Set();
      stdout
        .trim()
        .split("\n")
        .forEach((line) => {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && !isNaN(pid)) pidsToKill.add(pid);
        });
      if (pidsToKill.size > 0) {
        exec(
          `taskkill /F ${Array.from(pidsToKill)
            .map((p) => `/PID ${p}`)
            .join(" ")}`,
          () => resolve()
        );
      } else {
        resolve();
      }
    });
  });
}

function startFrontendServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    expressApp.use(express.static(FRONTEND_PATH));
    expressApp.get("/api/gallery", async (req, res) => {
        await db.read();
        const hostIp = getLocalIpAddress();
        const imageBaseUrl = `http://${hostIp}:${BACKEND_PORT}/view?`;
        const images = db.data.images.map(img => ({
            ...img,
            imageUrl: `${imageBaseUrl}filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
        }));
        res.json(images);
    });

    expressApp.post("/api/gallery/save", express.json(), async (req, res) => {
        try {
            const { prompt, imageInfo, generationData } = req.body;
            db.data.images.unshift({
                id: Date.now(),
                prompt,
                filename: imageInfo.filename,
                subfolder: imageInfo.subfolder,
                type: imageInfo.type,
                createdAt: new Date().toISOString(),
                generationData: generationData || {}
            });
            await db.write();
            res.json({ success: true });
        } catch (e) {
            console.error("[Gallery] API Save error:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    expressApp.use(
      "/api",
      createProxyMiddleware({
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
        ws: true,
      })
    );
    expressApp.get("/host-info", (req, res) => {
        res.json({
            ip: getLocalIpAddress(),
            frontendPort: FRONTEND_PORT,
            backendPort: BACKEND_PORT,
            stableUrl: `http://${store.get('customHostname', 'kairo')}.local:${FRONTEND_PORT}`,
            defaultModel: store.get('defaultModel', null)
        });
    });
    expressApp.get("*", (req, res) => {
      const indexPath = path.join(FRONTEND_PATH, "index.html");
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.status(404).send(`index.html not found at ${indexPath}`);
    });
    const server = expressApp
      .listen(FRONTEND_PORT, "0.0.0.0", () => {
        console.log(
          `✅ Frontend server for network clients listening on port ${FRONTEND_PORT}`
        );
        resolve(server);
      })
      .on("error", (err) => {
        console.error("Failed to start frontend:", err);
        reject(err);
      });
  });
}

function createWindow(isSetupMode = false) {
  mainWindow = new BrowserWindow({
    width: isSetupMode ? 800 : 1400,
    height: isSetupMode ? 600 : 900,
    minWidth: isSetupMode ? 800 : 1280,
    minHeight: isSetupMode ? 600 : 800,
    title: `Kairo Host`,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !IS_PACKAGED,
    },
  });
  if (!IS_PACKAGED) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.setMenu(null);
  const pageToLoad = isSetupMode ? "setup.html" : "index.html";
  mainWindow.loadFile(path.join(FRONTEND_PATH, pageToLoad));
  mainWindow.on("ready-to-show", async () => {
    if (!isSetupMode) {
        await initializeIpAddressFile();
        startIpAddressUpdater();
    }
    mainWindow.show();
  });
}

function startComfyUIBackend() {
  try {
    const batFilePath = path.join(COMFYUI_PATH, "run_nvidia_gpu.bat");
    if (!fs.existsSync(batFilePath))
      throw new Error(`The file 'run_nvidia_gpu.bat' was not found at the specified ComfyUI path: ${COMFYUI_PATH}`);
    
    comfyProcess = spawn("cmd.exe", ["/c", batFilePath, "--listen"], {
      cwd: COMFYUI_PATH,
      shell: true,
      windowsHide: false,
    });

    const sendOrBufferLog = (data) => {
        const msg = data.toString();
        console.log(`[ComfyUI Backend]: ${msg.trim()}`);
        if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("comfyui-status-update", msg);
        } else {
            logBuffer.push(msg);
        }
    };

    comfyProcess.stdout.on("data", sendOrBufferLog);
    comfyProcess.stderr.on("data", sendOrBufferLog);

    comfyProcess.on("close", (code) => {
      if (!app.isQuitting)
        dialog.showErrorBox(
          "Backend Process Closed",
          `The ComfyUI backend process has closed unexpectedly with exit code: ${code}.\n\nThis is often caused by errors in custom nodes or missing dependencies (like 'segment_anything'). Please check the backend console logs for specific error messages.`
        );
    });
  } catch (error) {
    dialog.showErrorBox("Backend Startup Error", error.message);
  }
}

async function initializeIpAddressFile() {
  let e = store.get("ipAddressFilePath");
  if (e && fs.existsSync(e)) ipAddressFilePath = e;
  else {
    if (!mainWindow) return;
    const { canceled: t, filePath: o } = await dialog.showSaveDialog(
      mainWindow,
      {
        title: "Select Location for Host Address File",
        defaultPath: path.join(
          os.homedir(),
          "Desktop",
          "kairo_host_address.txt"
        ),
        buttonLabel: "Save Location",
        filters: [{ name: "Text Files", extensions: ["txt"] }],
      }
    );
    if (t || !o)
      return (
        dialog.showErrorBox(
          "Setup Canceled",
          "Host address file not set. IP update disabled this session."
        ),
        void (ipAddressFilePath = null)
      );
    (ipAddressFilePath = o), store.set("ipAddressFilePath", o);
  }
}
function writeIpAddressToFile() {
  if (ipAddressFilePath) {
    try {
      const ipAddress = getLocalIpAddress();
      const customHostname = store.get('customHostname', 'kairo');
      const ipUrl = `http://${ipAddress}:${FRONTEND_PORT}`;
      const hostnameUrl = `http://${customHostname}.local:${FRONTEND_PORT}`;
      
      const content = `You can access Kairo using a modern web browser on any device connected to the same Wi-Fi network.\n\nPrimary Address (Recommended):\n${hostnameUrl}\n\nAlternative IP Address (If the above doesn't work):\n${ipUrl}\n\nLast updated: ${new Date().toLocaleString()}`;
      
      fs.writeFileSync(ipAddressFilePath, content);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(`Kairo Host - Network URL: ${hostnameUrl}`);
      }
    } catch (e) {
      console.error("Failed to write IP:", e);
    }
  }
}
function startIpAddressUpdater() {
  ipAddressFilePath &&
    (writeIpAddressToFile(),
    (ipAddressUpdateInterval = setInterval(writeIpAddressToFile, 3e4)));
}

app.on("ready", async () => {
  const e = app.requestSingleInstanceLock();
  if (!e) return void app.quit();
  app.on("second-instance", (e, t, o) => {
    mainWindow &&
      (mainWindow.isMinimized() && mainWindow.restore(), mainWindow.focus());
  });

  const { default: Store } = await import("electron-store");
  store = new Store();
  
  const { Low } = await import("lowdb");
  const { JSONFile } = await import("lowdb/node");
  
  const dataDir = path.join(app.getPath('userData'), 'app_data');
  if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'gallery.json');
  const adapter = new JSONFile(dbPath);
  db = new Low(adapter, { images: [] });
  await db.read();
  
  COMFYUI_PATH = store.get('comfyUIPath');

  if (!COMFYUI_PATH || !fs.existsSync(COMFYUI_PATH)) {
    createWindow(true); 
  } else {
    await cleanupLingeringProcesses();
    try {
      await startFrontendServer();
      createWindow();
      startComfyUIBackend(); 
      mainWindow.show();
      
      startMDNSService();
      
    } catch (e) {
    dialog.showErrorBox(
      "Fatal Error",
      `Failed to launch application.\n\n${e.message}`
    ),
      app.quit();
    }
    }
});

function startMDNSService() {
    if (bonjour) {
        bonjour.unpublishAll(() => {
            bonjour.destroy();
            console.log('[mDNS] Service stopped for restart.');
            bonjour = null;
            setTimeout(startMDNSService, 100); 
        });
        return;
    }

    bonjour = new BonjourService.default();
    const customHostname = store.get('customHostname', 'kairo');
    const serviceConfig = {
        name: customHostname,
        type: 'http',
        port: FRONTEND_PORT,
        host: `${customHostname}.local`
    };

    const publishedService = bonjour.publish(serviceConfig);

    publishedService.on('up', () => {
        const msg = `[mDNS] Service up: ${serviceConfig.host} on port ${serviceConfig.port}`;
        console.log(msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mdns-status', { status: 'up', message: msg });
        }
    });

    publishedService.on('down', () => {
        const msg = `[mDNS] Service '${serviceConfig.name}' is down.`;
        console.log(msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mdns-status', { status: 'down', message: msg });
        }
    });
    
    publishedService.on('error', (err) => {
        const msg = `[mDNS] Error with service '${serviceConfig.name}': ${err.message}`;
        console.error(msg);
        dialog.showErrorBox("mDNS Error", `The local network service ('${serviceConfig.name}') failed to start. Other devices may not be able to discover this host. \n\nDetails: ${err.message}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mdns-status', { status: 'error', message: msg });
        }
    });

    console.log(`[mDNS] Publishing service with name '${serviceConfig.name}'...`);
}

ipcMain.on('renderer-ready-for-logs', () => {
    console.log("✅ Renderer is ready. Flushing log buffer.");
    rendererReady = true;
    while(logBuffer.length > 0) {
        const msg = logBuffer.shift();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("comfyui-status-update", msg);
        }
    }
});

ipcMain.handle("get-host-ip", () => ({
  ip: getLocalIpAddress(),
  frontendPort: FRONTEND_PORT,
  backendPort: BACKEND_PORT,
  stableUrl: `http://${store.get('customHostname', 'kairo')}.local:${FRONTEND_PORT}`,
  comfyUIPath: store.get('comfyUIPath'), 
  defaultModel: store.get('defaultModel', null)
}));

ipcMain.handle("get-hostname", () => {
    return store.get('customHostname', 'kairo');
});

ipcMain.handle("set-hostname", (event, newHostname) => {
    store.set('customHostname', newHostname);
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Hostname Changed',
        message: 'The application will now restart to apply the new hostname.',
        buttons: ['OK']
    }).then(() => {
        app.relaunch();
        app.quit();
    });
});

ipcMain.handle('select-comfyui-path', async () => {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Your ComfyUI Folder',
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, path: null };
  }

  const selectedPath = filePaths[0];
  const validationFilePath = path.join(selectedPath, 'run_nvidia_gpu.bat');
  if (!fs.existsSync(validationFilePath)) {
    dialog.showErrorBox('Invalid Folder', `The selected folder does not appear to be a valid ComfyUI installation. Could not find 'run_nvidia_gpu.bat'.`);
    return { success: false, path: null };
  }

  store.set('comfyUIPath', selectedPath);
  
  app.relaunch();
  app.quit();

  return { success: true, path: selectedPath };
});

ipcMain.handle("get-available-models", async () => {
    try {
        const comfyBasePath = path.join(
            COMFYUI_PATH,
            "ComfyUI",
            "models"
        );

        if (!fs.existsSync(comfyBasePath)) {
            throw new Error(`The 'ComfyUI/models' directory was not found inside your selected ComfyUI path: ${COMFYUI_PATH}`);
        }

        const modelSet = new Set();
        const modelDirectories = ['checkpoints', 'unet', 'gguf'];

        for (const dir of modelDirectories) {
            const fullPath = path.join(comfyBasePath, dir);
            if (fs.existsSync(fullPath)) {
                const files = await fs.promises.readdir(fullPath);
                files.forEach(file => {
                    const lowerFile = file.toLowerCase();
                    if (lowerFile.endsWith('.safetensors') || lowerFile.endsWith('.ckpt') || lowerFile.endsWith('.gguf')) {
                        modelSet.add(`${dir}/${file}`);
                    }
                });
            }
        }
        
        const models = Array.from(modelSet);
        console.log(`[Model Scan]: Found ${models.length} models:`, models);
        return models;

    } catch (e) {
        dialog.showErrorBox("Model Scan Failed", e.message);
        return [];
    }
});

ipcMain.handle("interrupt-generation", async () => {
  try {
    await axios.post(`http://127.0.0.1:${BACKEND_PORT}/interrupt`);
    return { success: !0 };
  } catch (e) {
    return { success: !1, error: e.message };
  }
});

ipcMain.handle("get-default-model", async () => {
    return store.get("defaultModel", null);
});

ipcMain.handle("set-default-model", async (event, modelName) => {
    store.set("defaultModel", modelName);
    return { success: true };
});

ipcMain.handle("save-image", async (e, { url: t, suggestedFilename: o }) => {
  const r = BrowserWindow.fromWebContents(e.sender),
    { canceled: n, filePath: i } = await dialog.showSaveDialog(r, {
      title: "Save Image",
      defaultPath: o,
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
  if (n || !i) return { success: !1, cancelled: !0 };
  try {
    const e = await axios.get(t, { responseType: "arraybuffer" });
    return (
      await fs.promises.writeFile(i, Buffer.from(e.data)),
      { success: !0, filePath: i }
    );
  } catch (e) {
    return (
      dialog.showErrorBox("Save Failed", e.message),
      { success: !1, error: e.message }
    );
  }
});

ipcMain.handle("keywords:get", async () => store.get("customKeywords", []));
ipcMain.handle(
  "keywords:save",
  async (e, t) => (store.set("customKeywords", t), { success: !0 })
);

ipcMain.handle("gallery:save", async (event, { prompt, imageInfo, generationData }) => {
    try {
        db.data.images.unshift({ 
            id: Date.now(), 
            prompt, 
            filename: imageInfo.filename,
            subfolder: imageInfo.subfolder,
            type: imageInfo.type,
            createdAt: new Date().toISOString(),
            generationData: generationData || {} 
        });
        await db.write();
        return { success: true };
    } catch (e) {
        console.error("[Gallery] Save error:", e);
        return { success: false, error: e.message };
    }
});


ipcMain.handle("gallery:get", async () => {
    await db.read();
    const hostIp = getLocalIpAddress();
    const imageBaseUrl = `http://${hostIp}:${BACKEND_PORT}/view?`;
    const images = db.data.images.map(img => ({
        ...img,
        imageUrl: `${imageBaseUrl}filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
    }));
    return images;
});

ipcMain.handle("gallery:delete", async (event, imageId) => {
    db.data.images = db.data.images.filter(img => img.id !== imageId);
    await db.write();
    return { success: true };
});

ipcMain.handle("gallery:clear", async () => {
    db.data.images = [];
    await db.write();
    return { success: true };
});

ipcMain.handle("gallery:open-folder", (event, image) => {
    const fullPath = path.join(COMFYUI_PATH, "output", image.subfolder, image.filename);
    shell.showItemInFolder(fullPath);
});

app.on("before-quit", (event) => {
    app.isQuitting = true;

    if (comfyProcess && !comfyProcess.killed) {
        spawn("taskkill", ["/PID", comfyProcess.pid, "/F", "/T"]);
    }

    if (ipAddressUpdateInterval) {
        clearInterval(ipAddressUpdateInterval);
    }

    if (bonjour) {
        console.log('[mDNS] Unpublishing all services before quit.');
        
        try {
            bonjour.unpublishAllSync();
            bonjour.destroy();
            console.log('[mDNS] Services unpublished and destroyed.');
        } catch (e) {
            console.error('[mDNS] Error during shutdown:', e);
        }
    }
});

app.on("window-all-closed", () => {
  process.platform !== "darwin" && app.quit();
});

app.on("activate", () => {});
