@echo off
echo ===============================================
echo    SmartFrame Web Scraper Launcher
echo ===============================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Download the LTS version, install it, and restart your computer.
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version
echo.

REM Check if dependencies are installed
if not exist "node_modules\" (
    echo Installing dependencies for the first time...
    echo This may take a few minutes...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Failed to install dependencies!
        echo Please check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
)

echo Starting SmartFrame Web Scraper...
echo.
echo The application will open at: http://localhost:5000
echo.
echo Press Ctrl+C to stop the server when you're done.
echo ===============================================
echo.

REM Start the development server
call npm run dev
