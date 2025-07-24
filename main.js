// File: main.js
// FINAL CORRECTED VERSION - Fixes ERR_REQUIRE_ESM error

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const axios = require("axios");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const BonjourService = require("bonjour-service");

// --- Global Variables ---
let store; // Changed: No longer initializing Store class here
let comfyProcess;
let mainWindow;
let bonjour;
const FRONTEND_PORT = 7860;
const BACKEND_PORT = 8188;
let ipAddressUpdateInterval;
let ipAddressFilePath;
let rendererReady = false;
const logBuffer = [];

// --- NEW: RELIABLE PATHING LOGIC ---
const IS_PACKAGED = app.isPackaged;
const UNPACKED_PATH_BASE = IS_PACKAGED
  ? path.join(process.resourcesPath, "app.asar.unpacked")
  : __dirname;
const FRONTEND_PATH = path.join(UNPACKED_PATH_BASE, "Frontend");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
let COMFYUI_PATH; // Will be set after checking store

// ========== Utility & Core ==========
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
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

// ========== Server & Window Management ==========
function startFrontendServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();
    expressApp.use(express.static(FRONTEND_PATH));
    expressApp.use(
      "/api",
      createProxyMiddleware({
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
        ws: true,
      })
    );
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
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
  mainWindow.loadFile(path.join(FRONTEND_PATH, "index.html"));
  mainWindow.on("ready-to-show", async () => {
    await initializeIpAddressFile();
    startIpAddressUpdater();
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
          "Backend Closed",
          `ComfyUI exited with code: ${code}`
        );
    });
  } catch (error) {
    dialog.showErrorBox("Startup Error", error.message);
  }
}

// ========== App Lifecycle & Other Functions ==========
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
      const e = getLocalIpAddress(),
        t = `http://${e}:${FRONTEND_PORT}`,
        o = `${t}\n\nLast updated: ${new Date().toLocaleString()}`;
      fs.writeFileSync(ipAddressFilePath, o),
        mainWindow &&
          !mainWindow.isDestroyed() &&
          mainWindow.setTitle(`Kairo Host - UI available at ${t}`);
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

  // --- THIS IS THE FIX FOR THE ERR_REQUIRE_ESM ERROR ---
  const { default: Store } = await import("electron-store");
  store = new Store();
  // ---------------------------------------------------

  COMFYUI_PATH = store.get('comfyUIPath');

  if (!COMFYUI_PATH || !fs.existsSync(COMFYUI_PATH)) {
    // If path is not set or invalid, go into setup mode.
    createWindow(); // Create window without starting backend
    mainWindow.show();
    // The frontend will handle the UI for setup.
  } else {
    // Path is valid, start the app normally.
    await cleanupLingeringProcesses();
    try {
      await startFrontendServer();
      createWindow();
      startComfyUIBackend(); // Start the backend only when the path is valid
      mainWindow.show();
      
      // --- NEW: BONJOUR/MDNS SERVICE ---
      bonjour = new BonjourService.default();
      const customHostname = store.get('customHostname', 'kairo');
      bonjour.publish({ name: 'Kairo', type: 'http', port: FRONTEND_PORT, host: `${customHostname}.local` });
      console.log(`Published ${customHostname}.local service via mDNS`);
      // ---------------------------------

    } catch (e) {
    dialog.showErrorBox(
      "Fatal Error",
      `Failed to launch application.\n\n${e.message}`
    ),
      app.quit();
    }
  }
});

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
  comfyUIPath: store.get('comfyUIPath') // Send path to frontend
}));

ipcMain.handle("get-hostname", () => {
    return store.get('customHostname', 'kairo');
});

ipcMain.handle("set-hostname", (event, newHostname) => {
    store.set('customHostname', newHostname);
    
    if (bonjour) {
        bonjour.unpublishAll(() => {
            bonjour.destroy();
            app.relaunch();
            app.quit();
        });
    } else {
        app.relaunch();
        app.quit();
    }
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
  // Basic validation: check if a key file exists
  const validationFilePath = path.join(selectedPath, 'run_nvidia_gpu.bat');
  if (!fs.existsSync(validationFilePath)) {
    dialog.showErrorBox('Invalid Folder', `The selected folder does not appear to be a valid ComfyUI installation. Could not find 'run_nvidia_gpu.bat'.`);
    return { success: false, path: null };
  }

  store.set('comfyUIPath', selectedPath);
  
  // Relaunch the app to apply the new path
  app.relaunch();
  app.quit();

  return { success: true, path: selectedPath };
});

ipcMain.handle("get-available-models", async () => {
    try {
        const comfyBasePath = path.join(
            COMFYUI_PATH,
            "ComfyUI_windows_portable_nvidia",
            "ComfyUI_windows_portable",
            "ComfyUI",
            "models"
        );

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

app.on("before-quit", () => {
  (app.isQuitting = !0),
    comfyProcess &&
      !comfyProcess.killed &&
      spawn("taskkill", ["/PID", comfyProcess.pid, "/F", "/T"]),
    ipAddressUpdateInterval && clearInterval(ipAddressUpdateInterval),
    bonjour && bonjour.unpublishAll(() => {
        console.log('Unpublished all mDNS services.');
        bonjour.destroy();
    });
});

app.on("window-all-closed", () => {
  process.platform !== "darwin" && app.quit();
});

app.on("activate", () => {});
