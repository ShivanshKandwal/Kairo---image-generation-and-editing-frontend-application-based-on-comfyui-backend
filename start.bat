@echo off
REM ==========================================================
REM ==                                                      ==
REM ==  Kairo Studio - Development Start Script             ==
REM ==                                                      ==
REM ==========================================================
REM ==                                                      ==
REM == This script automates the process of starting the    ==
REM == Kairo application for development. It checks for     ==
REM == node_modules and then runs "npm start".              ==
REM ==                                                      ==
REM ==========================================================

TITLE Kairo Studio Launcher

ECHO.
ECHO [KAIRO LAUNCHER] Starting Kairo Studio...
ECHO.

REM Check if node_modules directory exists. If not, run npm install.
IF NOT EXIST "node_modules" (
    ECHO [KAIRO LAUNCHER] The "node_modules" folder was not found.
    ECHO [KAIRO LAUNCHER] Running "npm install" to set up dependencies. This might take a minute...
    ECHO.
    npm install
    
    REM Check if npm install succeeded.
    IF ERRORLEVEL 1 (
        ECHO.
        ECHO [KAIRO LAUNCHER] ERROR: "npm install" failed. Please check your Node.js installation and network connection.
        PAUSE
        EXIT /B 1
    )
    
    ECHO.
    ECHO [KAIRO LAUNCHER] Dependencies installed successfully.
    ECHO.
)

ECHO [KAIRO LAUNCHER] Launching the application with "npm start".
ECHO [KAIRO LAUNCHER] A new terminal window for the ComfyUI backend may appear.
ECHO.

REM Start the application.
npm start

ECHO.
ECHO [KAIRO LAUNCHER] Application has been closed.
PAUSE