# Kairo 2.0

**Kairo — Your creative AI lab powered by ComfyUI**

Kairo is a desktop application built with Electron that provides a user-friendly interface for a variety of AI-powered image manipulation tasks. It leverages the power of ComfyUI in the backend to perform these tasks.

## Features

Kairo offers a suite of tools for creative image manipulation:

*   **Image Generation:** Create new images from a text description.
*   **Combine Images:** Stitch two images together into a new scene.
*   **Image Editing:** Upload an image and transform it with a prompt.
*   **Replace or Transform:** Change elements within an image, like backgrounds or text.
*   **Image Transform:** Convert an image from one style to another, like line art.
*   **Style Transform:** Use an image as a style reference for a new creation.
*   **Upscale Image:** Increase the resolution and detail of your images.
*   **Background Remover:** Automatically remove the background from any image.

## Core Technologies

*   **Frontend:** Vanilla HTML, CSS, & JavaScript
*   **Backend API:** [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
*   **Desktop Framework:** [Electron](https://www.electronjs.org/)
*   **AI Models:** FLUX.1 (via GGUF Models), BEN2(BG-Removal) & Upscale Models

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Kairo2.0
    ```

2.  **Install dependencies:**
    Make sure you have [Node.js](https://nodejs.org/) installed.
    ```bash
    npm install
    ```

3.  **Set up ComfyUI:**
    Kairo requires a local installation of ComfyUI. If you don't have it, you can download it from the [ComfyUI releases page](https://github.com/comfyanonymous/ComfyUI/releases). On the first run, Kairo will prompt you to select the path to your ComfyUI installation.

## Usage

To run the application in development mode:

```bash
npm start
```

This will start the Electron application.

To build the application :

```bash
npm run pack
```

This will create a distributable package in the `dist` directory.

## How it Works

Kairo is an Electron application that acts as a frontend for ComfyUI.

*   The **main process** (`main.js`) is responsible for creating the application window and handling communication with the operating system. It also manages the ComfyUI backend process.
*   The **renderer process** (`Frontend/`) is responsible for rendering the user interface. It's built with standard web technologies (HTML, CSS, JavaScript).
*   The **preload script** (`preload.js`) securely exposes specific Node.js and Electron APIs to the renderer process, allowing the frontend to communicate with the main process to perform actions like saving files, getting system information, and interacting with the ComfyUI backend.
*   **ComfyUI** runs as a separate process, and Kairo communicates with it via its API. The `preload.js` script exposes a `comfyAPI` object to the frontend, which allows it to send requests to the ComfyUI server and receive status updates.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
