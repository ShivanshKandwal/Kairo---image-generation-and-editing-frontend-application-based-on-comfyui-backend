@echo off
TITLE My App - ComfyUI Backend (NVIDIA GPU)

REM --- Change this path to your ComfyUI installation folder ---
cd C:\Software\ComfyUI\ComfyUI_windows_portable_nvidia\ComfyUI_windows_portable

REM --- This now runs your modified GPU script ---
call run_nvidia_gpu.bat