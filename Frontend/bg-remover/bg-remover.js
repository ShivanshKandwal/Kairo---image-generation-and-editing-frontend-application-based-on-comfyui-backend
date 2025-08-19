// File: Frontend/bg-remover/bg-remover.js
// This version is updated to work for both the Host (Electron) and Clients (web browser).

document.addEventListener("DOMContentLoaded", () => {
  // --- Dynamic Path Configuration ---
  const isElectron = typeof window.electron !== 'undefined';
  const API_BASE_PATH = isElectron ? "http://127.0.0.1:8188" : "/api";

  const getWsUrl = (clientId) => {
    if (isElectron) {
      return `ws://127.0.0.1:8188/ws?clientId=${clientId}`;
    }
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}/api/ws?clientId=${clientId}`;
  };
  // ------------------------------------

  let lastGeneratedResult = null;

  const WORKFLOW_BLUEPRINT = {
    "1": {
      "inputs": {
        "image": "placeholder.png",
        "mask_channel": "alpha",
        "scale_by": 1.0,
        "resize_mode": "longest_side",
        "size": 0,
        "image_path_or_URL": "placeholder.png",
        "upscale_method": "lanczos"
      },
      "class_type": "AILab_LoadImage"
    },
    "2": {
      "inputs": {
        "model": "BiRefNet-general",
        "mask_blur": 0,
        "mask_offset": 0,
        "invert_output": false,
        "refine_foreground": false,
        "background": "Alpha",
        "image": [
          "1",
          0
        ]
      },
      "class_type": "BiRefNetRMBG"
    },
    "5": {
      "inputs": {
        "filename_prefix": "BG_Removed",
        "only_preview": true,
        "images": [
          "2",
          0
        ]
      },
      "class_type": "easy imageSave"
    }
  };
  const MAPPING = {
    loadImageNode: "1",
    backgroundRemoveNode: "2",
    previewNode: "5",
  };

  const ui = {
    uploadArea: document.getElementById("upload-area"),
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
  };
  let selectedFile = null;

  const queuePrompt = async () => {
    if (!selectedFile) {
      ui.statusDiv.textContent = "❌ Please upload an image first!";
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
      const userInput = { imageName: imageData.name };
      workflow[MAPPING.loadImageNode].inputs.image = userInput.imageName;
      workflow[MAPPING.loadImageNode].inputs.image_path_or_URL = userInput.imageName;

      const clientId = Math.random().toString(36).substring(2);
      // FIXED: Use dynamic API_BASE_PATH
      const apiResponse = await fetch(`${API_BASE_PATH}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      });

      if (!apiResponse.ok) {
        let errorData = await apiResponse.text();
        try {
          errorData = JSON.parse(errorData);
        } catch {}
        console.error("API Error:", errorData);
        throw new Error(
          `API request failed: ${
            apiResponse.statusText
          }. Details: ${JSON.stringify(errorData)}`
        );
      }
      const data = await apiResponse.json();
      if (data.error)
        throw new Error(
          `API Error: ${data.error.type} - ${data.error.message}`
        );

      listenForProgress(
        clientId,
        data.prompt_id,
        MAPPING.previewNode,
        userInput
      );
    } catch (error) {
      console.error("An error occurred:", error);
      ui.statusDiv.textContent = `❌ Error: ${error.message}`;
      setLoadingState(false);
    }
  };

  const listenForProgress = (
    clientId,
    promptId,
    finalNodeId,
    generationParams
  ) => {
    // FIXED: Use dynamic WebSocket URL
    const socket = new WebSocket(getWsUrl(clientId));
    socket.onopen = () => {
      ui.statusDiv.textContent = "⚡ Connected! Removing background...";
    };
    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "progress") {
        const { value, max } = msg.data;
        const percentage = Math.round((value / max) * 100);
        ui.progressBarFill.style.width = `${percentage}%`;
        ui.progressSteps.textContent = `${value} / ${max}`;
        ui.progressPercent.textContent = `${percentage}%`;
        ui.statusDiv.textContent = `⏳ Processing... Step ${value} of ${max}`;
      } else if (msg.type === "executed" && msg.data.node === finalNodeId) {
        socket.close();
        ui.statusDiv.textContent = "✅ Processing complete! Fetching image...";
        const imageInfo = await fetchFinalImage(promptId, finalNodeId);
        if (imageInfo) {
          displayFinalImage(imageInfo, generationParams);
        } else {
          setLoadingState(false);
          ui.statusDiv.textContent = "❌ Failed to retrieve processed image.";
        }
      } else if (msg.type === "execution_error") {
        socket.close();
        ui.statusDiv.textContent = `❌ Error during ComfyUI execution.`;
        setLoadingState(false);
      }
    };
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      ui.statusDiv.textContent = "❌ WebSocket connection error.";
      setLoadingState(false);
    };
  };

  const fetchFinalImage = async (promptId, outputNodeId) => {
    try {
      // FIXED: Use dynamic API_BASE_PATH
      const res = await fetch(`${API_BASE_PATH}/history/${promptId}`);
      if (!res.ok)
        throw new Error(`HTTP error fetching history: ${res.status}`);
      const data = await res.json();
      const imageInfo = data[promptId]?.outputs[outputNodeId]?.images[0];
      if (!imageInfo) {
        console.warn(`[DEBUG] No image info found.`);
        setLoadingState(false);
      }
      return imageInfo;
    } catch (error) {
      console.error("Error fetching final image from history:", error);
      ui.statusDiv.textContent =
        "❌ Failed to fetch final image data from ComfyUI history.";
      setLoadingState(false);
      return null;
    }
  };

  const displayFinalImage = (imageInfo, generationParams) => {
    // FIXED: Use dynamic API_BASE_PATH
    const imageUrl = `${API_BASE_PATH}/view?filename=${encodeURIComponent(
      imageInfo.filename
    )}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=${
      imageInfo.type
    }`;
    const originalFilename = generationParams.imageName
      .split(".")
      .slice(0, -1)
      .join(".");
    lastGeneratedResult = {
      url: imageUrl,
      filename: `${originalFilename}_BG-Removed.png`,
      suggestedFilename: `${originalFilename}_BG-Removed.png`,
    };
    ui.outputImage.src = imageUrl;
    ui.outputImage.classList.remove("hidden");
    ui.statusDiv.textContent = 'Done! ✅ Click "Save Image" to download.';
    ui.actionBar.classList.remove("hidden");
    ui.generationDetails.innerHTML = `<p>Background removed from: <strong>${generationParams.imageName}</strong></p>`;
    ui.generationDetails.classList.remove("hidden");
    setLoadingState(false);
  };

  const handleSaveClick = async (e) => {
    e.preventDefault();
    if (!lastGeneratedResult) return;
    if (isElectron) {
      await window.electron.saveImage(lastGeneratedResult);
    } else {
      const link = document.createElement("a");
      link.href = lastGeneratedResult.url;
      link.download = lastGeneratedResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const setLoadingState = (isLoading) => {
    ui.generateButton.disabled = isLoading;
    ui.loader.classList.toggle("hidden", !isLoading);
    const hasImage =
      ui.outputImage.src &&
      !ui.outputImage.classList.contains("hidden") &&
      ui.outputImage.src !== window.location.href;
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

  const setupEventListeners = () => {
    ui.uploadArea.addEventListener("click", () => ui.imageUpload.click());
    ui.imageUpload.addEventListener("change", (event) => {
      if (event.target.files && event.target.files[0]) {
        selectedFile = event.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          ui.imagePreview.src = e.target.result;
          ui.imagePreview.classList.remove("hidden");
          ui.uploadPrompt.classList.add("hidden");
          ui.statusDiv.textContent =
            'Image loaded. Click "Remove Background" to proceed.';
        };
        reader.readAsDataURL(selectedFile);
      }
    });
    ui.generateButton.addEventListener("click", queuePrompt);
    ui.saveButton.addEventListener("click", handleSaveClick);
  };

  setupEventListeners();
});
