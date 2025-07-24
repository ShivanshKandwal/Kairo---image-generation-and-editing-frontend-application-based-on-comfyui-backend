// File: Frontend/img-transform/style-transform.js
// FINAL CORRECTED VERSION: Fixes 'missing class_type' and ensures client-server compatibility.

document.addEventListener('DOMContentLoaded', () => {

    // --- Dynamic Path Configuration ---
    const isElectron = typeof window.comfyAPI !== 'undefined';
    const API_BASE_PATH = isElectron ? 'http://127.0.0.1:8188' : '/api';

    const getWsUrl = (clientId) => {
        if (isElectron) {
            return `ws://127.0.0.1:8188/ws?clientId=${clientId}`;
        }
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${window.location.host}/api/ws?clientId=${clientId}`;
    };
    // ------------------------------------

    let lastGeneratedResult = null;
    let currentWorkflow = {};

    // =========================================================================
    // === THE FIX: Simplified and validated workflow structures. =============
    // =========================================================================
const GGUF_WORKFLOW_BLUEPRINT = { "6":{"inputs":{"text":"...","clip":["193",0]},"class_type":"CLIPTextEncode"}, "11":{"inputs":{"guidance":2.5,"conditioning":["194",0]},"class_type":"FluxGuidance"}, "27":{"inputs":{"vae_name":"ae.safetensors"},"class_type":"VAELoader"}, "163":{"inputs":{"seed":300,"steps":20,"cfg":1,"sampler_name":"euler","scheduler":"simple","denoise":1,"model":["192",0],"positive":["11",0],"negative":["195",0],"latent_image":["208",0]},"class_type":"KSampler"}, "164":{"inputs":{"samples":["163",0],"vae":["27",0]},"class_type":"VAEDecode"}, "171":{"inputs":{"images":["164",0]},"class_type":"PreviewImage"}, "188":{"inputs":{"pixels":["196",0],"vae":["27",0]},"class_type":"VAEEncode"}, "192":{"inputs":{"unet_name":"flux1-kontext-dev-Q4_K_M.gguf"},"class_type":"UnetLoaderGGUF"}, "193":{"inputs":{"clip_name1":"PLACEHOLDER.gguf","clip_name2":"clip_l.safetensors","type":"flux"},"class_type":"DualCLIPLoaderGGUF"}, "194":{"inputs":{"conditioning":["6",0],"latent":["188",0]},"class_type":"ReferenceLatent"}, "195":{"inputs":{"conditioning":["6",0]},"class_type":"ConditioningZeroOut"}, "196":{"inputs":{"image":["203",0]},"class_type":"FluxKontextImageScale"}, "203":{"inputs":{"image":"placeholder_style.png"},"class_type":"LoadImage"}, "208":{"inputs":{"width":1024,"height":1024,"batch_size":1},"class_type":"EmptySD3LatentImage"} };
const FP8_WORKFLOW_BLUEPRINT = { "6":{"inputs":{"text":"...","clip":["193",0]},"class_type":"CLIPTextEncode"}, "11":{"inputs":{"guidance":2.5,"conditioning":["194",0]},"class_type":"FluxGuidance"}, "27":{"inputs":{"vae_name":"ae.safetensors"},"class_type":"VAELoader"}, "163":{"inputs":{"seed":300,"steps":20,"cfg":1,"sampler_name":"euler","scheduler":"simple","denoise":1,"model":["192",0],"positive":["11",0],"negative":["195",0],"latent_image":["208",0]},"class_type":"KSampler"}, "164":{"inputs":{"samples":["163",0],"vae":["27",0]},"class_type":"VAEDecode"}, "171":{"inputs":{"images":["164",0]},"class_type":"PreviewImage"}, "188":{"inputs":{"pixels":["196",0],"vae":["27",0]},"class_type":"VAEEncode"}, "192":{"inputs":{"unet_name":"flux1-dev-kontext_fp8_scaled.safetensors" , "weight_dtype": "default"},"class_type":"UNETLoader"}, "193":{"inputs":{"clip_name1":"t5xxl_fp16.safetensors", "clip_name2":"clip_l.safetensors","type":"flux"},"class_type":"DualCLIPLoader"}, "194":{"inputs":{"conditioning":["6",0],"latent":["188",0]},"class_type":"ReferenceLatent"}, "195":{"inputs":{"conditioning":["6",0]},"class_type":"ConditioningZeroOut"}, "196":{"inputs":{"image":["203",0]},"class_type":"FluxKontextImageScale"}, "203":{"inputs":{"image":"placeholder_style.png"},"class_type":"LoadImage"}, "208":{"inputs":{"width":1024,"height":1024,"batch_size":1},"class_type":"EmptySD3LatentImage"} };   
    const ui = { imageUpload: document.getElementById('image-upload'), uploadPrompt: document.getElementById('upload-prompt'), imagePreview: document.getElementById('image-preview'), positivePrompt: document.getElementById('positive-prompt'), seedInput: document.getElementById('seed'), randomizeSeedButton: document.getElementById('randomize-seed'), generateButton: document.getElementById('generate-button'), loader: document.getElementById('loader'), outputImage: document.getElementById('output-image'), placeholderText: document.querySelector('.placeholder-text'), statusDiv: document.getElementById('status'), actionBar: document.getElementById('action-bar'), saveButton: document.getElementById('save-button'), generationDetails: document.getElementById('generation-details'), progressContainer: document.getElementById('progress-container'), progressBarFill: document.getElementById('progress-bar-fill'), progressSteps: document.getElementById('progress-steps'), progressPercent: document.getElementById('progress-percent'), queueStatusWrapper: document.getElementById('queue-status-wrapper'), queueCount: document.getElementById('queue-count'), executingNode: document.getElementById('executing-node'), stopButton: document.getElementById('stop-button'), };
    
    const findNodeIdByClass = (workflow, classType) => Object.keys(workflow).find(id => workflow[id].class_type === classType);

    const queuePrompt = async () => {
        if (!ui.imageUpload.files[0]) {
            ui.statusDiv.textContent = '❌ Please upload a style reference image first!';
            return;
        }
        setLoadingState(true);
        ui.statusDiv.textContent = '📤 Uploading style image...';
        try {
            const formData = new FormData();
            formData.append('image', ui.imageUpload.files[0]);
            const uploadResponse = await fetch(`${API_BASE_PATH}/upload/image`, { method: 'POST', body: formData });
            if (!uploadResponse.ok) throw new Error('Failed to upload style image.');
            const imageData = await uploadResponse.json();
            
            ui.statusDiv.textContent = '✅ Style image uploaded. Preparing workflow...';
            const activeModel = localStorage.getItem('kairo-active-model');
            if (!activeModel) throw new Error("No active model selected in Settings.");

            const blueprint = activeModel.endsWith('.gguf') ? GGUF_WORKFLOW_BLUEPRINT : FP8_WORKFLOW_BLUEPRINT;
            
            let workflow = JSON.parse(JSON.stringify(blueprint));
            currentWorkflow = workflow;
            const userInput = getUserInput(imageData.name);
            updateWorkflow(workflow, userInput, activeModel);
            
            const clientId = Math.random().toString(36).substring(2);
            const apiResponse = await fetch(`${API_BASE_PATH}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) });
            
            if (!apiResponse.ok) {
                let errorDetailsMessage = `API request failed: ${apiResponse.statusText}`;
                try {
                    const errorData = await apiResponse.json();
                    if (errorData.node_errors && Object.keys(errorData.node_errors).length > 0) {
                        const firstErrorNodeId = Object.keys(errorData.node_errors)[0];
                        const nodeError = errorData.node_errors[firstErrorNodeId];
                        errorDetailsMessage = `Error in node ${firstErrorNodeId}: ${nodeError.errors[0].message}`;
                    } else if (errorData.error) {
                        errorDetailsMessage = `API Error: ${errorData.message} (${errorData.details || 'No details'})`;
                    }
                } catch (e) { /* Ignore if not JSON */ }
                throw new Error(errorDetailsMessage);
            }
            const data = await apiResponse.json();
            if (data.error) throw new Error(`API Error: ${data.error.type} - ${data.error.message}`);
            
            const previewNodeId = findNodeIdByClass(workflow, "PreviewImage");
            listenForProgress(clientId, data.prompt_id, previewNodeId, userInput);

        } catch (error) {
            console.error('An error occurred:', error);
            ui.statusDiv.textContent = `❌ Error: ${error.message}`;
            setLoadingState(false);
        }
    };
    
    // The rest of the file (updateWorkflow, listenForProgress, etc.) remains unchanged.

    const updateWorkflow = (workflow, params, activeModel) => {
        const loadImgNodeId = findNodeIdByClass(workflow, "LoadImage");
        const promptNodeId = findNodeIdByClass(workflow, "CLIPTextEncode");
        const kSamplerNodeId = findNodeIdByClass(workflow, "KSampler");
        const emptyLatentNodeId = findNodeIdByClass(workflow, "EmptySD3LatentImage");
        if(loadImgNodeId) workflow[loadImgNodeId].inputs.image = params.imageName;
        if(promptNodeId) workflow[promptNodeId].inputs.text = params.prompt;
        if(kSamplerNodeId) { workflow[kSamplerNodeId].inputs.seed = params.seed; workflow[kSamplerNodeId].inputs.steps = params.steps; }
        if(emptyLatentNodeId) { workflow[emptyLatentNodeId].inputs.width = params.width; workflow[emptyLatentNodeId].inputs.height = params.height; }
        const modelFilename = activeModel.split('/').pop();
        if (activeModel.endsWith('.gguf')) {
            const unetLoaderId = findNodeIdByClass(workflow, "UnetLoaderGGUF");
            const clipLoaderId = findNodeIdByClass(workflow, "DualCLIPLoaderGGUF");
            if (unetLoaderId) workflow[unetLoaderId].inputs.unet_name = modelFilename;
            if (clipLoaderId) {
                const match = modelFilename.match(/-([Q_0-9A-Z_]+)\.gguf$/i);
                if (!match || !match[1]) throw new Error(`Could not parse GGUF model name: ${modelFilename}`);
                workflow[clipLoaderId].inputs.clip_name1 = `t5-v1_1-xxl-encoder-${match[1]}.gguf`;
            }
        } else {
            const unetLoaderId = findNodeIdByClass(workflow, "UNETLoader");
            if (unetLoaderId) workflow[unetLoaderId].inputs.unet_name = modelFilename;
        }
    };
    
    const listenForProgress = (clientId, promptId, finalNodeId, generationParams) => {
        const socket = new WebSocket(getWsUrl(clientId));
        socket.onopen = () => ui.statusDiv.textContent = '⚡ Connected! Waiting for generation...';
        socket.onerror = (err) => { console.error("WebSocket Error:", err); ui.statusDiv.textContent = '❌ WebSocket connection error.'; setLoadingState(false); };
        socket.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
                case 'status': ui.queueCount.textContent = `Queue: ${msg.data.status.exec_info.queue_remaining}`; break;
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
            return (await res.json())[promptId]?.outputs[finalNodeId]?.images[0];
        } catch (error) { console.error("Error fetching final image:", error); return null; }
    };

    const getUserInput = (imageName) => {
        const sliders = document.querySelectorAll('input[type="range"]');
        const sliderValues = {};
        sliders.forEach(s => sliderValues[s.id] = parseInt(s.value, 10));
        const uInput = { prompt: ui.positivePrompt.value, seed: ui.seedInput.value ? parseInt(ui.seedInput.value, 10) : Math.floor(Math.random() * 10 ** 15), imageName: imageName, ...sliderValues };
        ui.seedInput.value = uInput.seed;
        return uInput;
    };

    const displayFinalImage = (imageInfo, generationParams) => {
        const imageUrl = `${API_BASE_PATH}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${imageInfo.type}`;
        lastGeneratedResult = { url: imageUrl, filename: `Kairo_Styled_${generationParams.seed}.png`, suggestedFilename: `Kairo_Styled_${generationParams.seed}.png` };
        ui.outputImage.src = imageUrl;
        ui.outputImage.classList.remove('hidden');
        ui.placeholderText.classList.add('hidden');
        ui.loader.classList.add('hidden');
        ui.queueStatusWrapper.classList.add('hidden');
        ui.progressContainer.classList.add('hidden');
        ui.actionBar.classList.remove('hidden');
        const modelName = (localStorage.getItem('kairo-active-model') || "Unknown").split('/').pop();
        ui.generationDetails.innerHTML = `<h4>Generation Details</h4><p><strong>Model:</strong> ${modelName}</p><p><strong>Seed:</strong> ${generationParams.seed}</p><p><strong>Steps:</strong> ${generationParams.steps}</p><p><strong>Dimensions:</strong> ${generationParams.width}x${generationParams.height}</p><p><strong>Prompt:</strong> ${generationParams.prompt}</p>`;
        ui.generationDetails.classList.remove('hidden');
        ui.statusDiv.textContent = '✅ Generation Complete!';
        ui.generateButton.disabled = false;
    };

    const setLoadingState = (isLoading) => {
        ui.generateButton.disabled = isLoading;
        if (isLoading) {
            ui.loader.classList.remove('hidden');
            ui.progressContainer.classList.remove('hidden');
            ui.queueStatusWrapper.classList.remove('hidden');
            ui.outputImage.classList.add('hidden');
            ui.outputImage.src = '#';
            ui.placeholderText.classList.add('hidden');
            ui.actionBar.classList.add('hidden');
            ui.generationDetails.classList.add('hidden');
            ui.progressBarFill.style.width = '0%';
            ui.progressSteps.textContent = '0 / 0';
            ui.progressPercent.textContent = '0%';
            ui.queueCount.textContent = 'Queue: -';
            ui.executingNode.textContent = 'Initializing...';
        } else {
            ui.loader.classList.add('hidden');
            ui.progressContainer.classList.add('hidden');
            ui.queueStatusWrapper.classList.add('hidden');
            const hasImage = ui.outputImage.src && !ui.outputImage.src.endsWith('#');
            ui.placeholderText.classList.toggle('hidden', hasImage);
        }
    };

    const interruptGeneration = async () => {
        if (isElectron) return window.comfyAPI.interruptGeneration();
        return fetch(`${API_BASE_PATH}/interrupt`, { method: "POST" });
    };
    
    const handleStopClick = async () => {
        ui.stopButton.disabled = true;
        ui.stopButton.textContent = 'Stopping...';
        try {
            await interruptGeneration();
        } catch(e) {
            console.error("Interrupt request failed:", e);
        } finally {
            ui.stopButton.disabled = false;
            ui.stopButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="20" height="20"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" /></svg> Stop`;
        }
    };

    const handleSaveClick = async (e) => {
        e.preventDefault();
        if (!lastGeneratedResult) return;
        if (isElectron) {
            await window.electronAPI.saveImage(lastGeneratedResult);
        } else {
            const link = document.createElement('a');
            link.href = lastGeneratedResult.url;
            link.download = lastGeneratedResult.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const updateSliderTrack = (slider) => {
        const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
        slider.style.setProperty('--value', `${percentage}%`);
    };

    const setupEventListeners = () => {
        ui.imageUpload.addEventListener('change', (event) => {
            if (event.target.files && event.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    ui.imagePreview.src = e.target.result;
                    ui.imagePreview.classList.remove('hidden');
                    if (ui.uploadPrompt) ui.uploadPrompt.classList.add('hidden');
                };
                reader.readAsDataURL(event.target.files[0]);
            }
        });
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = document.getElementById(`${slider.id}-value`);
            const updateUI = () => { if (valueSpan) { valueSpan.textContent = slider.value; } updateSliderTrack(slider); };
            slider.addEventListener('input', updateUI);
            updateUI();
        });
        ui.randomizeSeedButton.addEventListener('click', () => { ui.seedInput.value = Math.floor(Math.random() * 10 ** 15); });
        ui.generateButton.addEventListener('click', queuePrompt);
        ui.stopButton.addEventListener('click', handleStopClick);
        ui.saveButton.addEventListener('click', handleSaveClick);
        const adjustSettingsGroup = document.getElementById('adjust-settings-group');
        if (adjustSettingsGroup) {
            adjustSettingsGroup.querySelector('.collapsible-header').addEventListener('click', () => {
                adjustSettingsGroup.classList.toggle('expanded');
            });
        }
    };

    setupEventListeners();
});