# Kairo - AI Image Generation Suite

Welcome to Kairo, a powerful and user-friendly application that harnesses the capabilities of ComfyUI to provide a seamless AI image generation experience. Kairo allows you to host a ComfyUI backend on one machine and connect to it from any other device on your network via a simple web browser.

## Features

*   **Network Hosting:** Host the ComfyUI backend on a powerful machine and access it from anywhere on your local network.
*   **Simplified UI:** An intuitive and easy-to-use interface for generating and editing AI images.
*   **mDNS Discovery:** Easily discover and connect to the Kairo host using a human-readable `.local` address (e.g., `http://kairo.local:7860`).
*   **Centralized Model Management:** All models are managed on the host machine, so clients don't need to download or install anything.
*   **Default Model for Guests:** The host can set a default model that will be automatically selected for all guest users, ensuring a consistent experience.

## Tech Stack

*   **Electron:** For the cross-platform host application.
*   **Node.js & Express:** For the backend server and proxy.
*   **Bonjour/mDNS:** For network service discovery.
*   **ComfyUI:** As the powerful and flexible AI image generation and editing backend.
*   **HTML, CSS, JavaScript:** For the user-friendly frontend.

## Getting Started

### For Hosts (Running the Kairo Application)

1.  **Download and Install ComfyUI:** If you don't already have it, download and install a standard ComfyUI package.
2.  **Configure ComfyUI:**
    *   Navigate to your ComfyUI installation directory.
    *   Open the `run_nvidia_gpu.bat` file (or the equivalent for your system) in a text editor.
    *   Find the line that starts the Python script (e.g., `.\python_embeded\python.exe -s ComfyUI\main.py`).
    *   Add the `--listen` flag to the end of this line. This allows ComfyUI to accept connections from other devices on your network.
    *   **Example:**
        *   **Original:** `.\python_embeded\python.exe -s ComfyUI\main.py`
        *   **Modified:** `.\python_embeded\python.exe -s ComfyUI\main.py --listen`
    *   **Note:** You do not need to add `--enable-cors-header`. The Kairo application handles this for you.
3.  **Launch Kairo:**
    *   Start the Kairo application.
    *   On the first launch, you will be prompted to select your ComfyUI directory. Choose the main directory that contains the `run_nvidia_gpu.bat` file.
    *   The application will then start the ComfyUI backend and the Kairo web server.
4.  **Set a Default Model (Optional):**
    *   Navigate to the settings page in the Kairo app.
    *   In the "Default Model for Guests" section, select a model from the dropdown. This model will be automatically loaded for anyone who connects to your host.

### For Guests (Connecting from a Web Browser)

1.  **Get the Host Address:** The host can find their Kairo address in the settings page of the Kairo application. It will look something like `http://kairo.local:7860` or `http://192.168.1.100:7860`.
2.  **Connect:** Open a web browser on any device on the same network and navigate to the host's address.
3.  **Start Creating:** The Kairo interface will load, and you can start generating images immediately. If the host has set a default model, it will be selected for you automatically.

## Detailed Feature Explanation

### Network Hosting

Kairo uses a built-in web server to host its user interface and a proxy to securely forward requests to the ComfyUI backend. This means you can run the resource-intensive AI models on a powerful desktop computer and still generate images from a laptop, tablet, or even a phone.

The app also uses mDNS (also known as Bonjour) to broadcast its presence on the network. This allows you to connect using a simple, memorable address like `http://kairo.local:7860` instead of having to find the host's IP address every time.

### Model Management

All AI models are stored and managed on the host machine within the ComfyUI directory structure. The Kairo app automatically scans the `checkpoints`, `unet`, and `gguf` folders inside `ComfyUI/models` to find and list all available models. This means that guests connecting to the host always have access to the latest models without needing to download or manage any files themselves.

### Default Model for Guests

To streamline the experience for guest users, the host can pre-select a default model. When a guest connects to the Kairo host, this model will be automatically loaded and ready for use. This is perfect for ensuring that everyone starts with a known, high-quality model.

## Kairo 2.0 Frontend Tools Overview

Kairo 2.0 provides a comprehensive suite of AI-powered image manipulation tools, each designed for specific creative tasks.

### 1. **Image Generation** (`Frontend/img-gen/index.html`)
- **Purpose**: Generate images from text prompts from scratch.
- **Key Features**:
  - **Prompt Interface**: A dedicated area to input positive and negative prompts.
  - **Keyword Palette**: Manage and apply custom keywords for consistent prompting.
  - **Generation Settings**: Control parameters like steps, guidance, image dimensions (width/height), and seed for reproducibility.
  - **Model Support**: Supports both GGUF and FP8 model formats.
  - **Prompting Guide**: Provides in-app guidance and examples for effective text-to-image generation.

### 2. **Combine Images** (`Frontend/img-edit/combine-images.html`)
- **Purpose**: Seamlessly merge two distinct images into a single, cohesive scene.
- **Key Features**:
  - **Dual Image Upload**: Upload two source images for combination.
  - **Directional Combining**: Choose how images are merged (e.g., left-to-right, top-to-bottom).
  - **Scene Description**: Provide a text prompt to guide the AI in blending the images into a unified scene.
  - **Intelligent Blending**: AI-powered blending ensures smooth transitions and contextual integration.

### 3. **Image Editing** (`Frontend/img-edit/image-editing.html`)
- **Purpose**: Modify existing images using natural language descriptions.
- **Key Features**:
  - **Single Image Upload**: Upload the image you wish to edit.
  - **Prompt-Based Editing**: Describe the desired changes (e.g., "change the car to red," "add a hat to the person").
  - **Context Preservation**: The AI understands the original image context, allowing for precise edits without altering unrelated elements.
  - **Denoise Strength**: Adjust the intensity of the edit, from subtle tweaks to significant transformations.

### 4. **Replace or Transform** (`Frontend/replace-or-change/replace-or-change.html`)
- **Purpose**: Perform targeted replacements or transformations within an image.
- **Key Features**:
  - **Transformation Types**: Select from "Replace Background," "Replace Character," "Change Style," or "Change Text."
  - **Context-Aware Prompting**: The prompt input adapts to the selected transformation type, guiding the user to provide relevant instructions.
  - **Precise Control**: Offers fine-grained control over which elements are changed and which remain untouched.

### 5. **Image Transform** (`Frontend/img-transform/image-transform.html`)
- **Purpose**: Convert the artistic style of an image to a different format.
- **Key Features**:
  - **Preset Transformations**: Includes options like "Line Art to Full Color," "Full Color to Line Art," and "Photo to Watercolor."
  - **Dynamic UI**: The user interface adjusts based on the selected transformation, providing relevant upload prompts (e.g., "Upload line art").
  - **Specialized Prompting**: Guides users on how to describe the desired artistic characteristics for each transformation type.

### 6. **Style Transform** (`Frontend/img-transform/style-transform.html`)
- **Purpose**: Generate new images by applying the artistic style from a reference image to new content described by a prompt.
- **Key Features**:
  - **Style Reference Upload**: Upload an image whose artistic style you want to emulate.
  - **New Image Description**: Provide a text prompt describing the content of the new image.
  - **Style-Content Fusion**: The AI combines the visual style of the uploaded image with the subject matter from your prompt.
  - **Adjustable Dimensions**: Control the width and height of the newly generated image.

### 7. **Upscale Image** (`Frontend/upscale-image.html`)
- **Purpose**: Increase the resolution and detail of an image using AI upscaling models.
- **Key Features**:
  - **Image Upload**: Upload any image for enhancement.
  - **Upscale Factors**: Choose from 2x, 4x, or 8x magnification.
  - **Intelligent Upscaling**: AI models intelligently add pixels and detail, avoiding simple stretching or pixelation.
  - **Model Configuration**: Allows for configuration of specific upscaling models within the `upscale-image.js` file.

### 8. **Background Remover** (`Frontend/bg-remover/bg-remover.html`)
- **Purpose**: Automatically remove the background from an image, leaving a transparent subject.
- **Key Features**:
  - **One-Click Operation**: Simple upload and a single button click to remove the background.
  - **BEN2 Node Integration**: Utilizes the BEN2 custom node within ComfyUI for efficient background removal.
  - **Transparent Output**: Generates PNG images with transparent backgrounds, ready for compositing.
  - **No Manual Masking**: Eliminates the need for manual selection or masking of the subject.

## Additional Setup: Models and Custom Nodes

Some of Kairo's advanced features require additional models or custom nodes to be installed in your ComfyUI environment. The easiest way to manage these is by using the **ComfyUI Manager**.

### Installing ComfyUI Manager

1.  Navigate to your `ComfyUI/custom_nodes` directory in your terminal (Command Prompt on Windows, or Terminal on Linux/macOS).
    *   Example path: `cd C:\path\to\ComfyUI\custom_nodes`
2.  Clone the ComfyUI Manager repository:
    ```bash
    git clone https://github.com/ltdrdata/ComfyUI-Manager comfyui-manager
    ```
3.  Restart your ComfyUI application. A new "Manager" button should appear in the ComfyUI interface.

### Installing Required Models and Nodes via ComfyUI Manager

Once ComfyUI Manager is installed:

1.  Open your ComfyUI interface and click the "Manager" button.
2.  From the Manager menu, you can:
    *   **Install Custom Nodes**: Click "Install Custom Nodes" to search for and install nodes like `Birefnet` or specific background removal nodes (e.g., `ComfyUI-Background-Remover`).
    *   **Install Models**: Click "Install Models" to find and download various upscale models (e.g., ESRGAN, Real-ESRGAN).

### Specific Recommendations:

*   **Upscale Models**: For the "Upscale Image" tool, you will need upscale models. The Kairo frontend is configured to use the following models by default:
    *   **2x Upscale**: `RealESRGAN_x2.pth`
    *   **4x Upscale**: `4x_NMKD-Siax_200k.pth`
    *   **8x Upscale**: `8x_NMKD-Superscale_150000_G.pth`
    You can find these and other compatible models through the ComfyUI Manager's "Install Models" section. A good starting point for understanding upscale models in ComfyUI is the [ComfyUI Examples: Upscale Models](https://github.com/comfyanonymous/ComfyUI_examples/blob/master/upscale_models) page.
*   **Background Remover (RMBG)**: The "Background Remover" tool utilizes the `BiRefNetRMBG` custom node, which uses the `BiRefNet-general` model. You can install this custom node by searching for "BiRefNetRMBG" or "Background Remover" in the ComfyUI Manager's "Install Custom Nodes" section. It is often part of a package like `ComfyUI-Background-Remover`.
*   **Birefnet Node**: The `Birefnet` node itself is part of the `BiRefNetRMBG` custom node, as mentioned above. Ensure you install the custom node that provides `BiRefNetRMBG` functionality.

## Troubleshooting

*   **"Model Scan Failed" Error:** This usually means the Kairo app can't find the `ComfyUI/models` directory inside the path you selected. Make sure you have selected the correct main ComfyUI directory.
*   **Cannot Connect from Another Device:**
    *   Ensure both the host and guest devices are on the same Wi-Fi network.
    *   Check that your firewall is not blocking connections to the Kairo app or the ComfyUI backend.
    *   Make sure you have added the `--listen` flag to your ComfyUI batch file.
