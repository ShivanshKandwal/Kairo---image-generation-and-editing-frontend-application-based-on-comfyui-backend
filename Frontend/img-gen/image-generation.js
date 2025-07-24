// File: image-generation.js
// THIS IS THE 100% COMPLETE AND FINAL VERSION.
// No sections have been omitted. This file is self-contained and ready to use.

document.addEventListener('DOMContentLoaded', () => {
    // --- Dynamic Path Configuration ---
    const isElectron = typeof window.electronAPI !== 'undefined';
    const API_BASE_PATH = isElectron ? 'http://127.0.0.1:8188' : '/api'; // For ComfyUI
    const API_BASE_PATH_CUSTOM = '/api'; // For our own API
    const getWsUrl = (clientId) => {
        if (isElectron) return `ws://127.0.0.1:8188/ws?clientId=${clientId}`;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${window.location.host}/api/ws?clientId=${clientId}`;
    };

    // --- State Variables ---
    let lastGeneratedResult = null;
    let currentWorkflow = {};

    // --- WORKFLOW BLUEPRINTS ---
    const GGUF_WORKFLOW_BLUEPRINT = { "6":{ "inputs":{ "text":"A prompt...", "clip":["211", 0] }, "class_type":"CLIPTextEncode" }, "11":{ "inputs":{ "guidance":3, "conditioning":["6", 0] }, "class_type":"FluxGuidance" }, "27":{ "inputs":{ "vae_name":"ae.safetensors" }, "class_type":"VAELoader" }, "163":{ "inputs":{ "seed":1, "steps":25, "cfg":1, "sampler_name":"euler", "scheduler":"simple", "denoise":1, "model":["210", 0], "positive":["11", 0], "negative":["195", 0], "latent_image":["208", 0] }, "class_type":"KSampler" }, "164":{ "inputs":{ "samples":["163", 0], "vae":["27", 0] }, "class_type":"VAEDecode" }, "171":{ "inputs":{ "filename_prefix": "KairoGen", "images":["164", 0] }, "class_type":"SaveImage" }, "195":{ "inputs":{ "conditioning":["6", 0] }, "class_type":"ConditioningZeroOut" }, "208":{ "inputs":{ "width":1024, "height":1024, "batch_size":1 }, "class_type":"EmptySD3LatentImage" }, "210":{ "inputs":{ "unet_name":"placeholder.gguf" }, "class_type":"UnetLoaderGGUF" }, "211":{ "inputs":{ "clip_name1":"PLACEHOLDER.gguf", "clip_name2":"clip_l.safetensors", "type":"flux" }, "class_type":"DualCLIPLoaderGGUF" } };
    const FP8_WORKFLOW_BLUEPRINT = { "6":{ "inputs":{ "text":"A prompt...", "clip":["193", 0] }, "class_type":"CLIPTextEncode" }, "11":{ "inputs":{ "guidance":2.5, "conditioning":["6", 0] }, "class_type":"FluxGuidance" }, "27":{ "inputs":{ "vae_name":"ae.safetensors" }, "class_type":"VAELoader" }, "163":{ "inputs":{ "seed":1, "steps":20, "cfg":1, "sampler_name":"euler", "scheduler":"simple", "denoise":1, "model":["192", 0], "positive":["11", 0], "negative":["195", 0], "latent_image":["208", 0] }, "class_type":"KSampler" }, "164":{ "inputs":{ "samples":["163", 0], "vae":["27", 0] }, "class_type":"VAEDecode" }, "171":{ "inputs":{ "filename_prefix":"KairoGen", "images":["164", 0] }, "class_type":"SaveImage" }, "192":{ "inputs":{ "unet_name":"placeholder.safetensors", "weight_dtype":"default" }, "class_type":"UNETLoader" }, "193":{ "inputs":{ "clip_name1":"clip_l.safetensors", "clip_name2":"t5xxl_fp16.safetensors", "type":"flux", "device":"default" }, "class_type":"DualCLIPLoader" }, "195":{ "inputs":{ "conditioning":["6", 0] }, "class_type":"ConditioningZeroOut" }, "208":{ "inputs":{ "width":1024, "height":1024, "batch_size":1 }, "class_type":"EmptySD3LatentImage" } };

    // --- UI Element References ---
    const ui = {
        controlsPanel: document.querySelector('.controls-panel'),
        positivePrompt: document.getElementById("positive-prompt"),
        seedInput: document.getElementById("seed"),
        randomizeSeedButton: document.getElementById("randomize-seed"),
        generateButton: document.getElementById("generate-button"),
        loader: document.getElementById("loader"),
        outputImage: document.getElementById("output-image"),
        placeholderText: document.querySelector(".placeholder-text"),
        statusDiv: document.getElementById("status"),
        actionBar: document.getElementById("action-bar"),
        saveButton: document.getElementById("save-button"),
        generationDetails: document.getElementById("generation-details"),
        progressContainer: document.getElementById("progress-container"),
        progressBarFill: document.getElementById("progress-bar-fill"),
        progressSteps: document.getElementById("progress-steps"),
        progressPercent: document.getElementById("progress-percent"),
        queueStatusWrapper: document.getElementById("queue-status-wrapper"),
        queueCount: document.getElementById("queue-count"),
        executingNode: document.getElementById("executing-node"),
        stopButton: document.getElementById("stop-button"),
        customKeywordContainer: document.getElementById('custom-keyword-buttons'),
        addKeywordBtn: document.getElementById('add-keyword-btn'),
        modal: document.getElementById('add-keyword-modal'),
        modalInput: document.getElementById('modal-keyword-input'),
        modalSaveBtn: document.getElementById('modal-save-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
    };
    
    // --- KEYWORD STATE MANAGEMENT & MODAL LOGIC ---
    const MAX_KEYWORDS = 10;
    let customKeywords = [];

    const loadInitialKeywords = async () => {
        let loadedKeywords = [];
        try {
            if (isElectron) {
                console.log("Running in Electron Host. Using electronAPI.");
                loadedKeywords = await window.electronAPI.getKeywords() || [];
            } else {
                console.log("Running in Browser Client. Using fetch API.");
                const response = await fetch(`${API_BASE_PATH_CUSTOM}/keywords`);
                if (!response.ok) throw new Error(`Server responded with ${response.status}`);
                loadedKeywords = await response.json();
            }
        } catch (error) {
            console.error("Failed to load custom keywords:", error);
            ui.statusDiv.textContent = '⚠️ Could not load custom keywords from host.';
            loadedKeywords = [];
        }
        customKeywords = loadedKeywords;
        renderCustomKeywords();
    };

    const getCustomKeywords = () => [...customKeywords];

    const saveCustomKeywords = async (keywords) => {
        customKeywords = [...keywords];
        try {
            if (isElectron) {
                await window.electronAPI.saveKeywords(keywords);
            } else {
                const response = await fetch(`${API_BASE_PATH_CUSTOM}/keywords`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keywords: keywords }),
                });
                if (!response.ok) throw new Error(`Server responded with ${response.status}`);
            }
        } catch (error) {
            console.error("Failed to save custom keywords:", error);
            ui.statusDiv.textContent = '⚠️ Could not save keywords to host.';
        }
    };

    const renderCustomKeywords = () => {
        const keywords = getCustomKeywords();
        const container = ui.customKeywordContainer;
        const addBtn = ui.addKeywordBtn;
        container.querySelectorAll('.custom-keyword-wrapper').forEach(w => w.remove());
        keywords.forEach(keyword => {
            const buttonWrapper = createKeywordButton(keyword, true);
            container.insertBefore(buttonWrapper, addBtn);
        });
        addBtn.disabled = keywords.length >= MAX_KEYWORDS;
        addBtn.title = addBtn.disabled ? 'Maximum number of custom keywords reached' : 'Add a new custom keyword';
        syncKeywordButtons();
    };

    const addKeyword = () => {
        if (getCustomKeywords().length >= MAX_KEYWORDS) {
            alert(`Maximum ${MAX_KEYWORDS} custom keywords allowed.`);
            return;
        }
        ui.modal.classList.remove('hidden');
        ui.modalInput.value = '';
        ui.modalInput.focus();
    };

    const hideKeywordModal = () => {
        ui.modal.classList.add('hidden');
    };

    const saveNewKeywordFromModal = async () => {
        const keywords = getCustomKeywords();
        const newKeyword = ui.modalInput.value;
        if (newKeyword && newKeyword.trim()) {
            const cleaned = newKeyword.trim();
            if (keywords.map(k => k.toLowerCase()).includes(cleaned.toLowerCase())) {
                alert('This keyword already exists!');
                return;
            }
            keywords.push(cleaned);
            await saveCustomKeywords(keywords);
            renderCustomKeywords();
            hideKeywordModal();
        } else {
            hideKeywordModal();
        }
    };

    const removeKeyword = async (keywordToRemove) => {
        if (!confirm(`Are you sure you want to remove "${keywordToRemove}"?`)) return;
        let keywords = getCustomKeywords().filter(k => k !== keywordToRemove);
        await saveCustomKeywords(keywords);
        renderCustomKeywords();
    };

    const createKeywordButton = (keyword, isCustom) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-keyword-wrapper';
        const keywordBtn = document.createElement('button');
        keywordBtn.className = 'keyword-btn';
        keywordBtn.textContent = keyword;
        keywordBtn.dataset.keyword = keyword.toLowerCase();
        wrapper.appendChild(keywordBtn);
        if (isCustom) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-keyword-btn';
            removeBtn.innerHTML = '×';
            removeBtn.title = `Remove "${keyword}"`;
            removeBtn.onclick = (e) => { e.stopPropagation(); removeKeyword(keyword); };
            wrapper.appendChild(removeBtn);
        }
        return wrapper;
    };

    const syncKeywordButtons = () => {
        const promptText = ui.positivePrompt.value.toLowerCase();
        document.querySelectorAll('[data-keyword]').forEach(btn => {
            const keyword = btn.dataset.keyword;
            if (keyword) {
                const keywordRegex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
                btn.classList.toggle('active', keywordRegex.test(promptText));
            }
        });
    };
    
    // --- CORE APPLICATION LOGIC ---

    const findNodeId = (workflow, classType) => Object.keys(workflow).find(id => workflow[id].class_type === classType);
    
    const queuePrompt = async () => {
        setLoadingState(true);
        ui.statusDiv.textContent = "🎨 Preparing workflow...";
        try {
            const activeModel = localStorage.getItem("kairo-active-model"); 
            if (!activeModel) throw new Error("No active model selected. Please go to Settings.");
            const blueprint = activeModel.toLowerCase().endsWith('.gguf') ? GGUF_WORKFLOW_BLUEPRINT : FP8_WORKFLOW_BLUEPRINT;
            let workflow = JSON.parse(JSON.stringify(blueprint));
            currentWorkflow = workflow;
            const userInput = getUserInput();
            updateWorkflow(workflow, userInput, activeModel);
            const clientId = Math.random().toString(36).substring(2);
            const apiResponse = await fetch(`${API_BASE_PATH}/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: workflow, client_id: clientId }),
            });
            if (!apiResponse.ok) {
                let errorDetailsMessage = `API request failed: ${apiResponse.statusText}`;
                try {
                    const errorData = await apiResponse.json();
                    if (errorData.node_errors && Object.keys(errorData.node_errors).length > 0) {
                        const firstErrorNodeId = Object.keys(errorData.node_errors)[0];
                        errorDetailsMessage = `Error in node ${firstErrorNodeId}: ${errorData.node_errors[firstErrorNodeId].errors[0].message}`;
                    } else if (errorData.error) {
                        errorDetailsMessage = `API Error: ${errorData.message} (${errorData.details || 'No details'})`;
                    }
                } catch (e) {}
                throw new Error(errorDetailsMessage);
            }
            const data = await apiResponse.json();
            if (data.error) throw new Error(`API Error: ${data.error.type} - ${data.error.message}`);
            listenForProgress(clientId, data.prompt_id, findNodeId(workflow, "SaveImage"), userInput);
        } catch (error) {
            console.error("An error occurred in queuePrompt:", error);
            ui.statusDiv.textContent = `❌ Error: ${error.message}`;
            setLoadingState(false);
        }
    };
    
    const updateWorkflow = (workflow, userInput, activeModel) => {
        const ids = { prompt: findNodeId(workflow, "CLIPTextEncode"), ksampler: findNodeId(workflow, "KSampler"), latent: findNodeId(workflow, "EmptySD3LatentImage"), guidance: findNodeId(workflow, "FluxGuidance"), ggufUnet: findNodeId(workflow, "UnetLoaderGGUF"), ggufClip: findNodeId(workflow, "DualCLIPLoaderGGUF"), fp8Unet: findNodeId(workflow, "UNETLoader"), };
        if (ids.prompt) workflow[ids.prompt].inputs.text = userInput.positivePrompt;
        if (ids.latent) { workflow[ids.latent].inputs.width = userInput.width; workflow[ids.latent].inputs.height = userInput.height; }
        if (ids.guidance) workflow[ids.guidance].inputs.guidance = userInput.guidance;
        if (ids.ksampler) { workflow[ids.ksampler].inputs.seed = userInput.seed; workflow[ids.ksampler].inputs.steps = userInput.steps; }
        const modelFilename = activeModel.split("/").pop();
        if (activeModel.toLowerCase().endsWith('.gguf')) {
            if (ids.ggufUnet) workflow[ids.ggufUnet].inputs.unet_name = modelFilename;
            if (ids.ggufClip) {
                const match = modelFilename.match(/-([Q0-9_A-Z]+)\.gguf$/i);
                if (match && match[1]) {
                    workflow[ids.ggufClip].inputs.clip_name1 = `t5-v1_1-xxl-encoder-${match[1]}.gguf`;
                } else { throw new Error(`Could not parse GGUF filename: ${modelFilename}`); }
            }
        } else {
            if (ids.fp8Unet) workflow[ids.fp8Unet].inputs.unet_name = modelFilename;
        }
    };
    
    const listenForProgress = (clientId, promptId, finalNodeId, generationParams) => {
        const socket = new WebSocket(getWsUrl(clientId));
        socket.onopen = () => { ui.statusDiv.textContent = "⚡ Connected! Waiting for generation..."; };
        socket.onerror = (err) => { console.error("WebSocket Error:", err); ui.statusDiv.textContent = "❌ WebSocket connection error."; setLoadingState(false); };
        socket.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'status':
                    const queueRemaining = msg.data.status.exec_info.queue_remaining;
                    ui.queueCount.textContent = `Queue: ${queueRemaining}`;
                    if (queueRemaining === 0) ui.executingNode.textContent = 'Finishing up...';
                    break;
                case 'execution_start': ui.progressContainer.classList.remove('hidden'); break;
                case 'progress':
                    const { value, max } = msg.data;
                    const percentage = Math.round((value / max) * 100);
                    ui.progressBarFill.style.width = `${percentage}%`;
                    ui.progressSteps.textContent = `${value} / ${max}`;
                    ui.progressPercent.textContent = `${percentage}%`;
                    ui.statusDiv.textContent = `⏳ Generating... Step ${value} of ${max}`;
                    break;
                case 'executed':
                    if (msg.data.node === finalNodeId) {
                        socket.close();
                        ui.statusDiv.textContent = '✅ Generation complete! Fetching image...';
                        const imageInfo = await fetchFinalImage(promptId, finalNodeId);
                        if (imageInfo) { displayFinalImage(imageInfo, generationParams); }
                        else { setLoadingState(false); ui.statusDiv.textContent = '❌ Failed to retrieve final image.'; }
                    }
                    break;
                case 'execution_interrupted': case 'execution_error':
                    socket.close(); setLoadingState(false);
                    ui.statusDiv.textContent = `❌ Generation ${msg.type === 'execution_error' ? 'Failed' : 'Stopped'}.`;
                    break;
            }
        };
    };
    
    const fetchFinalImage = async (promptId, finalNodeId) => {
        try {
            const res = await fetch(`${API_BASE_PATH}/history/${promptId}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.[promptId]?.outputs?.[finalNodeId]?.images?.[0] || null;
        } catch (error) { console.error("Error fetching final image:", error); return null; }
    };

    const getUserInput = () => {
        const sliders = document.querySelectorAll('input[type="range"]');
        const sliderValues = {};
        sliders.forEach(slider => {
            const id = slider.id;
            const value = id === 'guidance' ? parseFloat(slider.value) : parseInt(slider.value, 10);
            sliderValues[id] = value;
        });
        const userInput = {
            positivePrompt: ui.positivePrompt.value,
            seed: ui.seedInput.value.trim() !== "" ? parseInt(ui.seedInput.value, 10) : Math.floor(Math.random() * 10 ** 15),
            ...sliderValues,
        };
        ui.seedInput.value = userInput.seed;
        return userInput;
    };

    const displayFinalImage = (imageInfo, generationParams) => {
        const imageUrl = `${API_BASE_PATH}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${imageInfo.type}`;
        lastGeneratedResult = { url: imageUrl, filename: `Kairo_Generated_${generationParams.seed}.png` };
        ui.outputImage.src = imageUrl;
        ui.outputImage.classList.remove("hidden");
        ui.placeholderText.classList.add("hidden");
        ui.loader.classList.add("hidden");
        ui.queueStatusWrapper.classList.add("hidden");
        ui.progressContainer.classList.add("hidden");
        ui.actionBar.classList.remove("hidden");
        const activeModelForDisplay = (localStorage.getItem("kairo-active-model") || "Unknown").split("/").pop();
        ui.generationDetails.innerHTML = `<h4>Generation Details</h4><p><strong>Model:</strong> ${activeModelForDisplay}</p><p><strong>Seed:</strong> ${generationParams.seed}</p><p><strong>Steps:</strong> ${generationParams.steps}</p><p><strong>Guidance:</strong> ${generationParams.guidance}</p><p><strong>Dimensions:</strong> ${generationParams.width}x${generationParams.height}</p><p><strong>Prompt:</strong> ${generationParams.positivePrompt}</p>`;
        ui.generationDetails.classList.remove("hidden");
        ui.statusDiv.textContent = "✅ Generation Complete!";
        ui.generateButton.disabled = false;
        syncKeywordButtons();
    };

    const setLoadingState = (isLoading) => {
        ui.generateButton.disabled = isLoading;
        if (isLoading) {
            ui.outputImage.classList.add('hidden'); ui.outputImage.src = '#'; 
            ui.actionBar.classList.add('hidden'); ui.generationDetails.classList.add('hidden');
            ui.placeholderText.classList.add('hidden');
            ui.loader.classList.remove('hidden'); ui.progressContainer.classList.remove('hidden'); ui.queueStatusWrapper.classList.remove('hidden');
            ui.progressBarFill.style.width = '0%'; ui.progressSteps.textContent = '0 / 0'; ui.progressPercent.textContent = '0%';
            ui.queueCount.textContent = 'Queue: -'; ui.executingNode.textContent = 'Initializing...';
        } else {
            ui.loader.classList.add('hidden'); ui.queueStatusWrapper.classList.add('hidden'); ui.progressContainer.classList.add('hidden');
            const hasImage = ui.outputImage.src && !ui.outputImage.src.endsWith("#");
            if (!hasImage) ui.placeholderText.classList.remove('hidden');
        }
    };

    const interruptGeneration = async () => {
        if (isElectron && window.comfyAPI) return window.comfyAPI.interruptGeneration();
        return fetch(`${API_BASE_PATH}/interrupt`, { method: "POST" });
    };

    const handleStopClick = async () => {
        ui.stopButton.disabled = true;
        const originalText = ui.stopButton.innerHTML;
        ui.stopButton.textContent = "Stopping...";
        try { await interruptGeneration(); } 
        catch (e) {
            console.error("Interrupt request failed:", e);
            setLoadingState(false);
            ui.statusDiv.textContent = "❌ Failed to send stop command.";
        } finally {
            ui.stopButton.disabled = false;
            ui.stopButton.innerHTML = originalText;
        }
    };

    const handleSaveClick = async (e) => {
        e.preventDefault();
        if (!lastGeneratedResult) return;
        if (isElectron) {
            await window.electronAPI.saveImage(lastGeneratedResult);
        } else {
            const link = document.createElement("a");
            link.href = lastGeneratedResult.url;
            link.download = lastGeneratedResult.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const updateSliderTrack = (slider) => {
        const min = slider.min || 0;
        const max = slider.max || 100;
        const value = slider.value;
        const percentage = ((value - min) / (max - min)) * 100;
        slider.style.setProperty("--value", `${percentage}%`);
    };

    // --- EVENT HANDLING SETUP ---
    const setupEventListeners = () => {
        // 1. Bootstrap static HTML buttons by giving them their data "ID cards".
        document.querySelectorAll('.keyword-palette .keyword-btn:not(#add-keyword-btn)').forEach(button => {
            if (button.textContent) {
                button.dataset.keyword = button.textContent.toLowerCase();
            }
        });

        // 2. Add listeners for simple, non-delegated elements.
        ui.randomizeSeedButton.addEventListener("click", () => { ui.seedInput.value = Math.floor(Math.random() * 10 ** 15); });
        ui.generateButton.addEventListener("click", queuePrompt);
        ui.stopButton.addEventListener("click", handleStopClick);
        if (ui.saveButton) ui.saveButton.addEventListener("click", handleSaveClick);
        ui.addKeywordBtn.addEventListener('click', addKeyword);
        ui.positivePrompt.addEventListener('input', syncKeywordButtons);

        // 3. Add listeners for the new modal.
        ui.modalSaveBtn.addEventListener('click', saveNewKeywordFromModal);
        ui.modalCancelBtn.addEventListener('click', hideKeywordModal);
        ui.modal.addEventListener('click', (event) => {
            if (event.target === ui.modal) hideKeywordModal();
        });
        ui.modalInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') saveNewKeywordFromModal();
            if (event.key === 'Escape') hideKeywordModal();
        });

        // 4. Setup other UI listeners.
        const generationSettingsGroup = document.getElementById("generation-settings-group");
        if (generationSettingsGroup) {
            generationSettingsGroup.querySelector(".collapsible-header").addEventListener("click", () => {
                generationSettingsGroup.classList.toggle("expanded");
            });
        }
        
        document.querySelectorAll('input[type="range"]').forEach((slider) => {
            const valueSpan = document.getElementById(`${slider.id}-value`);
            const updateUI = () => {
                if (valueSpan) valueSpan.textContent = slider.id === "guidance" ? parseFloat(slider.value).toFixed(1) : slider.value;
                updateSliderTrack(slider);
};
            slider.addEventListener("input", updateUI);
            updateUI();
        });

        // 5. Set up the single, robust, delegated listener for all keyword buttons.
        if (ui.controlsPanel) {
            ui.controlsPanel.addEventListener('click', (event) => {
                const button = event.target.closest('[data-keyword]');
                if (button && button.id !== 'add-keyword-btn') {
                    const keyword = button.textContent;
                    const promptTextarea = ui.positivePrompt;
                    const escapedKeyword = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const keywordRegex = new RegExp(`\\b${escapedKeyword}\\b,?\\s?`, 'ig');
                    let currentText = promptTextarea.value;
                    if (keywordRegex.test(currentText)) {
                        promptTextarea.value = currentText.replace(keywordRegex, '').replace(/, ,/g, ',').replace(/,\s*$/, '').trim();
                    } else {
                        promptTextarea.value = (currentText ? `${currentText.trim().replace(/,$/, '')}, ` : '') + keyword;
                    }
                    promptTextarea.dispatchEvent(new Event('input'));
                }
            });
        }
        
        // 6. Load initial data. This is the first "action" the script takes.
        loadInitialKeywords();
    };

    // --- START THE APPLICATION ---
    setupEventListeners();
});