// FILE: Frontend/settings/settings.js
// This version correctly separates Host and Client logic, ensuring models and host info load properly.

document.addEventListener('DOMContentLoaded', () => {
    // --- Get references to all the HTML elements ---
    const modelSelect = document.getElementById('model-select');
    const statusMessage = document.getElementById('selection-status');
    const modelSelectionGroup = document.getElementById('model-selection-group');
    
    // Host/Client specific elements
    const hostInfoBox = document.getElementById('host-info-box');
    const networkIdentityBox = document.getElementById('network-identity-box');
    const hostnameInput = document.getElementById('hostname-input');
    const saveHostnameBtn = document.getElementById('save-hostname-btn');
    const errorBox = document.getElementById('connection-error-box');
    
    // Check if we are running in Electron (Host) or a browser (Client)
    const isElectron = typeof window.comfyAPI !== 'undefined';

    // --- Helper function to populate the model dropdown ---
    const populateModelList = (models) => {
        modelSelectionGroup.classList.remove('hidden');
        errorBox.classList.add('hidden');
        modelSelect.innerHTML = '';

        if (!models || models.length === 0) {
            const option = document.createElement('option');
            option.textContent = "No compatible models found on host.";
            option.disabled = true;
            modelSelect.appendChild(option);
            return;
        }

        models.forEach(modelPath => {
            const option = document.createElement('option');
            option.value = modelPath;
            const displayName = modelPath.includes('/') ? modelPath.split('/').pop() : modelPath;
            let type = 'SD'; // Default type
            if (modelPath.toLowerCase().endsWith('.gguf')) type = 'GGUF';
            if (modelPath.includes('diffusion_models/')) type = 'FP8';
            option.textContent = `${displayName} [${type}]`;
            modelSelect.appendChild(option);
        });

        const savedModel = localStorage.getItem('kairo-active-model');
        if (savedModel && models.includes(savedModel)) {
            modelSelect.value = savedModel;
        } else if (models.length > 0) {
            // Default to the first model if nothing is saved
            modelSelect.value = models[0];
            localStorage.setItem('kairo-active-model', models[0]);
        }
    };
    
    // --- Helper function to display connection errors ---
    const handleConnectionError = (error) => {
        console.error("Failed to load models:", error);
        modelSelectionGroup.classList.add('hidden');
        errorBox.classList.remove('hidden');
    };

    // =========================================================
    // --- MAIN LOGIC: Run different code for Host vs. Client ---
    // =========================================================

    if (isElectron) {
        // --- HOST / ELECTRON APP MODE ---
        // We have direct access to the backend via IPC.
        console.log("Settings: Running in Electron (Host) mode.");
        
        // Show the host info box and populate it
        hostInfoBox.classList.remove('hidden');
        networkIdentityBox.classList.remove('hidden');

        window.comfyAPI.getHostIp().then(info => {
            document.getElementById('host-ui-display').value = `http://${info.ip}:${info.frontendPort}`;
            document.getElementById('host-backend-display').value = `http://${info.ip}:${info.backendPort}`;
        }).catch(err => console.error("Could not get host IP:", err));

        window.comfyAPI.getHostname().then(hostname => {
            hostnameInput.value = hostname;
        });

        saveHostnameBtn.addEventListener('click', () => {
            const newHostname = hostnameInput.value.trim();
            if (newHostname) {
                window.comfyAPI.setHostname(newHostname);
            }
        });
        
        // Get the list of models directly
        window.comfyAPI.getAvailableModels()
            .then(populateModelList)
            .catch(handleConnectionError);

    } else {
        // --- CLIENT / BROWSER MODE ---
        // We must fetch data from the host via the /api proxy.
        console.log("Settings: Running in Browser (Client) mode.");

        // This function fetches the models from the host's ComfyUI API
        // In settings.js

        const fetchPrimaryModelsFromServer = async () => {
            // CORRECTED: All API calls go through the relative proxy path /api
            const response = await fetch('/api/object_info'); 
            if (!response.ok) {
                throw new Error(`Server connection failed: ${response.status}`);
            }
            const data = await response.json();
            const modelSet = new Set();
            
            // Define the nodes that load the models we care about
            const primaryLoaders = ['CheckpointLoaderSimple', 'UnetLoaderGGUF', 'UNETLoader'];
            
            primaryLoaders.forEach(nodeName => {
                const nodeInfo = data[nodeName]?.input?.required;
                if (nodeInfo) {
                    // This logic handles both ckpt_name (for checkpoints) and unet_name (for GGUF/UNET)
                    const modelList = nodeInfo.ckpt_name?.[0] || nodeInfo.unet_name?.[0];
                    if (Array.isArray(modelList)) {
                        modelList.forEach(model => modelSet.add(model));
                    }
                }
            });
            
            const models = Array.from(modelSet);
            console.log(`[Client Fetch]: Found ${models.length} models from API:`, models);
            return models;
        };

        // Call the fetch function
        fetchPrimaryModelsFromServer()
            .then(populateModelList)
            .catch(handleConnectionError);
    }

    // --- Shared event listener for model selection ---
    // This works for both Host and Client mode.
    modelSelect.addEventListener('change', () => {
        const selectedModel = modelSelect.value;
        localStorage.setItem('kairo-active-model', selectedModel);
        
        const displayName = selectedModel.includes('/') ? selectedModel.split('/').pop() : selectedModel;
        statusMessage.textContent = `Active model set to: ${displayName}`;
        // Clear the message after a few seconds
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    });
});
