// File: Frontend/upscale-image.js
// This version is updated to work for both the Host (Electron) and Clients (web browser).

document.addEventListener("DOMContentLoaded", () => {
  // --- Dynamic Path Configuration ---
  const isElectron = typeof window.comfyAPI !== "undefined";
  const API_BASE_PATH = isElectron ? "http://127.0.0.1:8188" : "/api";

  const getWsUrl = (clientId) => {
    if (isElectron) {
      return `ws://127.0.0.1:8188/ws?clientId=${clientId}`;
    }
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}/api/ws?clientId=${clientId}`;
  };
  // ------------------------------------

  let lastGeneratedImage = null;

  const UPSCALE_MODELS = {
    "2x": "RealESRGAN_x2.pth",
    "4x": "4x_NMKD-Siax_200k.pth",
    "8x": "8x_NMKD-Superscale_150000_G.pth",
  };
  const WORKFLOW_BLUEPRINT = {
    1: { inputs: { image: "placeholder.png" }, class_type: "LoadImage" },
    6: {
      inputs: { model_name: "RealESRGAN_x2.pth" },
      class_type: "UpscaleModelLoader",
    },
    21: {
      inputs: { upscale_model: ["6", 0], image: ["1", 0] },
      class_type: "ImageUpscaleWithModel",
    },
    23: {
      inputs: {
        filename_prefix: "Upscaled",
        only_preview: true,
        images: ["21", 0],
      },
      class_type: "easy imageSave",
    },
  };
  const MAPPING = {
    loadImageNode: "1",
    modelLoaderNode: "6",
    previewNode: "23",
  };

  const ui = {
    imageUpload: document.getElementById("image-upload"),
    uploadPrompt: document.getElementById("upload-prompt"),
    imagePreview: document.getElementById("image-preview"),
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
    upscaleFactorSelect: document.getElementById("upscale-factor"),
  };
  let selectedFile = null;

  const queuePrompt = async () => {
    if (!selectedFile) {
      ui.statusDiv.textContent = "❌ Please upload an image to upscale first!";
      return;
    }
    setLoadingState(true);
    ui.statusDiv.textContent = "📤 Uploading image...";
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      // FIXED: Use dynamic API_BASE_PATH
      const uploadResponse = await fetch(`${API_BASE_PATH}/upload/image`, {
        method: "POST",
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error("Failed to upload image.");
      const imageData = await uploadResponse.json();

      ui.statusDiv.textContent = "✅ Image uploaded. Preparing workflow...";
      let workflow = JSON.parse(JSON.stringify(WORKFLOW_BLUEPRINT));
      const userInput = {
        imageName: imageData.name,
        upscaleFactor: ui.upscaleFactorSelect.value,
      };
      const modelName = UPSCALE_MODELS[userInput.upscaleFactor];
      if (!modelName)
        throw new Error(
          `No model configured for ${userInput.upscaleFactor} upscale.`
        );
      workflow[MAPPING.loadImageNode].inputs.image = userInput.imageName;
      workflow[MAPPING.modelLoaderNode].inputs.model_name = modelName;

      const clientId = Math.random().toString(36).substring(2);
      // FIXED: Use dynamic API_BASE_PATH
      const apiResponse = await fetch(`${API_BASE_PATH}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      });

      if (!apiResponse.ok)
        throw new Error(`API request failed: ${apiResponse.statusText}`);
      const data = await apiResponse.json();
      if (data.error)
        throw new Error(
          `API Error: ${data.error.type} - ${data.error.message}`
        );

      listenForProgress(clientId, data.prompt_id, MAPPING.previewNode);
    } catch (error) {
      console.error("An error occurred:", error);
      ui.statusDiv.textContent = `❌ Error: ${error.message}`;
      setLoadingState(false);
    }
  };

  const listenForProgress = (clientId, promptId, finalNodeId) => {
    // FIXED: Use dynamic WebSocket URL
    const socket = new WebSocket(getWsUrl(clientId));
    socket.onopen = () => {
      ui.statusDiv.textContent = "⚡ Connected! Upscaling in progress...";
    };
    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "progress") {
        const percent = Math.round((msg.data.value / msg.data.max) * 100);
        ui.progressPercent.textContent = `${percent}%`;
        ui.progressBarFill.style.width = `${percent}%`;
        ui.progressSteps.textContent = `Step ${msg.data.value} of ${msg.data.max}`;
      }
      if (msg.type === "executed" && msg.data.node === finalNodeId) {
        socket.close();
        ui.statusDiv.textContent = "✅ Upscaling complete! Fetching image...";
        const imageInfo = await fetchFinalImage(promptId, finalNodeId);
        if (imageInfo) {
          displayFinalImage(imageInfo);
        }
      }
    };
    socket.onerror = (err) => {
      console.error(err);
      setLoadingState(false);
      ui.statusDiv.textContent = "❌ WebSocket connection error.";
    };
  };

  const fetchFinalImage = async (promptId, finalNodeId) => {
    try {
      // FIXED: Use dynamic API_BASE_PATH
      const res = await fetch(`${API_BASE_PATH}/history/${promptId}`);
      const data = await res.json();
      return data[promptId]?.outputs[finalNodeId]?.images[0];
    } catch (error) {
      console.error("Error fetching final image:", error);
      ui.statusDiv.textContent = "❌ Failed to fetch final image.";
      return null;
    }
  };

  const displayFinalImage = (imageInfo) => {
    // FIXED: Use dynamic API_BASE_PATH
    const imageUrl = `${API_BASE_PATH}/view?filename=${encodeURIComponent(
      imageInfo.filename
    )}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${
      imageInfo.type
    }`;
    ui.outputImage.src = imageUrl;
    ui.outputImage.classList.remove("hidden");
    ui.statusDiv.textContent =
      "Preview ready! ✅ Click save to choose a location.";
    ui.actionBar.classList.remove("hidden");
    lastGeneratedImage = {
      url: imageUrl,
      filename: `Kairo_Upscaled_${imageInfo.filename}`,
      suggestedFilename: `Kairo_Upscaled_${imageInfo.filename}`,
    };
    ui.generationDetails.classList.add("hidden");
    setLoadingState(false);
  };

  const setLoadingState = (isLoading) => {
    ui.generateButton.disabled = isLoading;
    ui.loader.classList.toggle("hidden", !isLoading);
    const hasImage =
      ui.outputImage.src && !ui.outputImage.classList.contains("hidden");
    ui.placeholderText.classList.toggle("hidden", isLoading || hasImage);
    ui.progressContainer.classList.toggle("hidden", !isLoading);
    if (isLoading) {
      ui.outputImage.classList.add("hidden");
      ui.actionBar.classList.add("hidden");
      ui.generationDetails.classList.add("hidden");
      ui.progressBarFill.style.width = "0%";
      ui.progressSteps.textContent = "...";
      ui.progressPercent.textContent = "";
    }
  };

  const handleSaveClick = async (e) => {
    e.preventDefault();
    if (!lastGeneratedImage) return;
    if (isElectron) {
      await window.electronAPI.saveImage(lastGeneratedImage);
    } else {
      const link = document.createElement("a");
      link.href = lastGeneratedImage.url;
      link.download = lastGeneratedImage.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const setupEventListeners = () => {
    const uploadArea = document.querySelector(".upload-area");
    if (uploadArea) {
      uploadArea.style.cursor = "pointer";
      uploadArea.addEventListener("click", () => ui.imageUpload.click());
    }
    ui.imageUpload.addEventListener("change", (event) => {
      if (event.target.files?.[0]) {
        selectedFile = event.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          ui.imagePreview.src = e.target.result;
          ui.imagePreview.classList.remove("hidden");
          if (ui.uploadPrompt) ui.uploadPrompt.classList.add("hidden");
        };
        reader.readAsDataURL(selectedFile);
      }
    });
    ui.generateButton.addEventListener("click", queuePrompt);
    ui.saveButton.addEventListener("click", handleSaveClick);
  };

  setupEventListeners();
});
