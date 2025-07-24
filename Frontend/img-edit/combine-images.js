// File: Frontend/img-edit/combine-images.js
// This version is updated to work for both the Host (Electron) and Clients (web browser).

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

    // (WORKFLOW BLUEPRINTS are unchanged and correct)
    const GGUF_WORKFLOW_BLUEPRINT = { "6": { "inputs": { "text": "A prompt...", "clip": ["209", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Prompt" } }, "11": { "inputs": { "guidance": 3.0, "conditioning": ["194", 0] }, "class_type": "FluxGuidance", "_meta": { "title": "Guidance" } }, "27": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } }, "163": { "inputs": { "seed": 0, "steps": 15, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 0.75, "model": ["210", 0], "positive": ["11", 0], "negative": ["195", 0], "latent_image": ["207", 0] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "164": { "inputs": { "samples": ["163", 0], "vae": ["27", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "171": { "inputs": { "images": ["164", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview" } }, "188": { "inputs": { "pixels": ["196", 0], "vae": ["27", 0] }, "class_type": "VAEEncode", "_meta": { "title": "Encode Reference" } }, "194": { "inputs": { "conditioning": ["6", 0], "latent": ["188", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "Set Reference" } }, "195": { "inputs": { "conditioning": ["6", 0] }, "class_type": "ConditioningZeroOut" }, "196": { "inputs": { "image": ["211", 0] }, "class_type": "FluxKontextImageScale", "_meta": { "title": "Scale Reference" } }, "203": { "inputs": { "image": "placeholder1.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Image 1" } }, "207": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptySD3LatentImage", "_meta": { "title": "Create Empty Latent" } }, "208": { "inputs": { "image": "placeholder2.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Image 2" } }, "209": { "inputs": { "clip_name1": "PLACEHOLDER.gguf", "clip_name2": "clip_l.safetensors", "type": "flux" }, "class_type": "DualCLIPLoaderGGUF", "_meta": { "title": "Load Text Encoders (GGUF)" } }, "210": { "inputs": { "unet_name": "flux1-kontext-dev-Q4_K_M.gguf" }, "class_type": "UnetLoaderGGUF", "_meta": { "title": "Load UNET (GGUF)" } }, "211": { "inputs": { "direction": "right", "match_image_size": true, "spacing_width": 0, "spacing_color": "black", "image1": ["203", 0], "image2": ["208", 0] }, "class_type": "ImageStitch", "_meta": { "title": "Stitch Images" } } };
    const FP8_WORKFLOW_BLUEPRINT = { "6": { "inputs": { "text": "A prompt...", "clip": ["193", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Prompt" } }, "11": { "inputs": { "guidance": 3.0, "conditioning": ["194", 0] }, "class_type": "FluxGuidance", "_meta": { "title": "Guidance" } }, "27": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } }, "163": { "inputs": { "seed": 0, "steps": 15, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 0.75, "model": ["192", 0], "positive": ["11", 0], "negative": ["195", 0], "latent_image": ["207", 0] }, "class_type": "KSampler", "_meta": { "title": "KSampler" } }, "164": { "inputs": { "samples": ["163", 0], "vae": ["27", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } }, "171": { "inputs": { "images": ["164", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview" } }, "188": { "inputs": { "pixels": ["196", 0], "vae": ["27", 0] }, "class_type": "VAEEncode", "_meta": { "title": "Encode Reference" } }, "192": { "inputs": { "unet_name": "flux1-dev-kontext_fp8_scaled.safetensors" , "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load UNET (FP8)" } }, "193": { "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" }, "class_type": "DualCLIPLoader", "_meta": { "title": "Load Text Encoders (FP8)" } }, "194": { "inputs": { "conditioning": ["6", 0], "latent": ["188", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "Set Reference" } }, "195": { "inputs": { "conditioning": ["6", 0] }, "class_type": "ConditioningZeroOut" }, "196": { "inputs": { "image": ["211", 0] }, "class_type": "FluxKontextImageScale", "_meta": { "title": "Scale Reference" } }, "203": { "inputs": { "image": "placeholder1.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Image 1" } }, "207": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptySD3LatentImage", "_meta": { "title": "Create Empty Latent" } }, "208": { "inputs": { "image": "placeholder2.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Image 2" } }, "211": { "inputs": { "direction": "right", "match_image_size": true, "spacing_width": 0, "spacing_color": "black", "image1": ["203", 0], "image2": ["208", 0] }, "class_type": "ImageStitch", "_meta": { "title": "Stitch Images" } } };
    const ui = { positivePrompt: document.getElementById('positive-prompt'), seedInput: document.getElementById('seed'), randomizeSeedButton: document.getElementById('randomize-seed'), generateButton: document.getElementById('generate-button'), loader: document.getElementById('loader'), outputImage: document.getElementById('output-image'), placeholderText: document.querySelector('.placeholder-text'), statusDiv: document.getElementById('status'), imageOneInput: document.getElementById('image-one-input'), imageTwoInput: document.getElementById('image-two-input'), imageOnePrompt: document.getElementById('image-one-prompt'), imageTwoPrompt: document.getElementById('image-two-prompt'), imageOnePreview: document.getElementById('image-one-preview'), imageTwoPreview: document.getElementById('image-two-preview'), stitchDirection: document.getElementById('stitch-direction'), actionBar: document.getElementById('action-bar'), saveButton: document.getElementById('save-button'), generationDetails: document.getElementById('generation-details'), progressContainer: document.getElementById('progress-container'), progressBarFill: document.getElementById('progress-bar-fill'), progressSteps: document.getElementById('progress-steps'), progressPercent: document.getElementById('progress-percent'), queueStatusWrapper: document.getElementById('queue-status-wrapper'), queueCount: document.getElementById('queue-count'), executingNode: document.getElementById('executing-node'), stopButton: document.getElementById('stop-button'), };

    const findNodeIdByClass = (workflow, classType) => Object.keys(workflow).find(id => workflow[id].class_type === classType);
    
    const queuePrompt = async () => {
        if (!ui.imageOneInput.files[0] || !ui.imageTwoInput.files[0]) {
            ui.statusDiv.textContent = '❌ Please upload both images first!';
            return;
        }
        setLoadingState(true);
        ui.statusDiv.textContent = '📤 Uploading images...';
        try {
            const [file1Data, file2Data] = await Promise.all([
                uploadImage(ui.imageOneInput.files[0]),
                uploadImage(ui.imageTwoInput.files[0])
            ]);
            if (!file1Data || !file2Data) throw new Error("Image upload failed.");
            ui.statusDiv.textContent = '✅ Images uploaded. Preparing workflow...';
            const activeModel = localStorage.getItem('kairo-active-model');
            if (!activeModel) throw new Error("No active model selected in Settings.");
            
            const blueprint = activeModel.endsWith('.gguf') ? GGUF_WORKFLOW_BLUEPRINT : FP8_WORKFLOW_BLUEPRINT;
            if (!blueprint) throw new Error(`Unsupported model type: ${activeModel}`);
            
            let workflow = JSON.parse(JSON.stringify(blueprint));
            currentWorkflow = workflow;
            const userInput = getUserInput(file1Data.name, file2Data.name);
            updateWorkflow(workflow, userInput, activeModel);
            const clientId = Math.random().toString(36).substring(2);

            // FIXED: Use the dynamic API_BASE_PATH
            const apiResponse = await fetch(`${API_BASE_PATH}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: workflow, client_id: clientId })
            });

            if (!apiResponse.ok) {
                const errorData = await apiResponse.json().catch(() => null);
                if (errorData && errorData.node_errors) {
                    const firstErrorNode = Object.keys(errorData.node_errors)[0];
                    const errorDetails = errorData.node_errors[firstErrorNode].errors[0];
                    throw new Error(`ComfyUI Error in node ${firstErrorNode} (${errorDetails.details}): ${errorDetails.message}`);
                }
                throw new Error(`API request failed: ${apiResponse.statusText}`);
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
    
    const getUserInput = (file1Name, file2Name) => {
        const userInput = { positivePrompt: ui.positivePrompt.value, seed: ui.seedInput.value ? parseInt(ui.seedInput.value, 10) : Math.floor(Math.random() * 10**15), stitchDirection: ui.stitchDirection.value, guidance: parseFloat(document.getElementById('guidance').value), denoise: parseFloat(document.getElementById('denoise').value), steps: parseInt(document.getElementById('steps').value, 10), file1Name, file2Name };
        ui.seedInput.value = userInput.seed;
        return userInput;
    };

    const updateWorkflow = (workflow, params, activeModel) => {
        const loadImg1NodeId = Object.keys(workflow).find(id => workflow[id]._meta?.title === "Load Image 1");
        const loadImg2NodeId = Object.keys(workflow).find(id => workflow[id]._meta?.title === "Load Image 2");
        const stitchNodeId = findNodeIdByClass(workflow, "ImageStitch");
        const promptNodeId = findNodeIdByClass(workflow, "CLIPTextEncode");
        const guidanceNodeId = findNodeIdByClass(workflow, "FluxGuidance");
        const kSamplerNodeId = findNodeIdByClass(workflow, "KSampler");
        if(loadImg1NodeId) workflow[loadImg1NodeId].inputs.image = params.file1Name;
        if(loadImg2NodeId) workflow[loadImg2NodeId].inputs.image = params.file2Name;
        if(stitchNodeId) workflow[stitchNodeId].inputs.direction = params.stitchDirection;
        if(promptNodeId) workflow[promptNodeId].inputs.text = params.positivePrompt;
        if(guidanceNodeId) workflow[guidanceNodeId].inputs.guidance = params.guidance;
        if(kSamplerNodeId) { workflow[kSamplerNodeId].inputs.seed = params.seed; workflow[kSamplerNodeId].inputs.steps = params.steps; workflow[kSamplerNodeId].inputs.denoise = params.denoise; }
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
        } else { // Assuming FP8 if not GGUF
            const unetLoaderId = findNodeIdByClass(workflow, "UNETLoader");
            if (unetLoaderId) workflow[unetLoaderId].inputs.unet_name = modelFilename;
        }
    };

    const uploadImage = async (file) => {
        const formData = new FormData();
        formData.append('image', file);
        try {
            // FIXED: Use the dynamic API_BASE_PATH
            const response = await fetch(`${API_BASE_PATH}/upload/image`, { method: 'POST', body: formData });
            if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Upload error:', error);
            return null;
        }
    };

    const listenForProgress = (clientId, promptId, finalNodeId, generationParams) => {
        // FIXED: Use the dynamic WebSocket URL
        const socket = new WebSocket(getWsUrl(clientId));
        socket.onopen = () => ui.statusDiv.textContent = '⚡ Connected! Waiting for generation...';
        socket.onclose = () => {};
        socket.onerror = (err) => { console.error("WebSocket Error:", err); ui.statusDiv.textContent = '❌ WebSocket connection error.'; setLoadingState(false); };
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
                        else { setLoadingState(false); ui.statusDiv.textContent = '❌ Failed to retrieve final image from server.'; }
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
            // FIXED: Use the dynamic API_BASE_PATH
            const res = await fetch(`${API_BASE_PATH}/history/${promptId}`);
            if (!res.ok) return null;
            return (await res.json())[promptId]?.outputs[finalNodeId]?.images[0];
        } catch (error) {
            console.error("Error fetching final image:", error);
            return null;
        }
    };
    
    const displayFinalImage = (imageInfo, generationParams) => {
        // FIXED: Use the dynamic API_BASE_PATH
        const imageUrl = `${API_BASE_PATH}/view?filename=${encodeURIComponent(imageInfo.filename)}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${imageInfo.type}`;
        lastGeneratedResult = { url: imageUrl, filename: `Kairo_Combined_${generationParams.seed}.png` };
        ui.outputImage.src = imageUrl;
        ui.outputImage.classList.remove('hidden');
        ui.placeholderText.classList.add('hidden');
        ui.loader.classList.add('hidden');
        ui.queueStatusWrapper.classList.add('hidden');
        ui.progressContainer.classList.add('hidden'); // Should be hidden on completion
        ui.actionBar.classList.remove('hidden');
        const activeModelForDisplay = (localStorage.getItem('kairo-active-model') || "Unknown").split('/').pop();
        ui.generationDetails.innerHTML = `<h4>Generation Details</h4><p><strong>Model:</strong> ${activeModelForDisplay}</p><p><strong>Seed:</strong> ${generationParams.seed}</p><p><strong>Steps:</strong> ${generationParams.steps}</p><p><strong>Guidance:</strong> ${generationParams.guidance.toFixed(1)}</p><p><strong>Denoise:</strong> ${generationParams.denoise.toFixed(2)}</p><p><strong>Direction:</strong> ${generationParams.stitchDirection}</p><p><strong>Prompt:</strong> ${generationParams.positivePrompt}</p>`;
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
    
    const handleImagePreview = (inputElement, previewElement, promptElement) => {
        const file = inputElement.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => { previewElement.src = e.target.result; previewElement.classList.remove('hidden'); promptElement.classList.add('hidden'); };
            reader.readAsDataURL(file);
        }
    };
    
    // FIXED: Added browser-compatible interrupt functionality
    const interruptGeneration = async () => {
        if (isElectron) {
            return window.comfyAPI.interruptGeneration();
        } else {
            return fetch(`${API_BASE_PATH}/interrupt`, { method: "POST" });
        }
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
    
    // FIXED: Added browser-compatible save functionality
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
        ui.imageOneInput.addEventListener('change', () => handleImagePreview(ui.imageOneInput, ui.imageOnePreview, ui.imageOnePrompt));
        ui.imageTwoInput.addEventListener('change', () => handleImagePreview(ui.imageTwoInput, ui.imageTwoPreview, ui.imageTwoPrompt));
        document.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = document.getElementById(`${slider.id}-value`);
            const updateUI = () => {
                if (valueSpan) {
                    valueSpan.textContent = parseFloat(slider.step) < 1 ? parseFloat(slider.value).toFixed(2) : slider.value;
                }
                updateSliderTrack(slider);
            };
            slider.addEventListener('input', updateUI);
            updateUI();
        });
        ui.randomizeSeedButton.addEventListener('click', () => { ui.seedInput.value = Math.floor(Math.random() * 10**15); });
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