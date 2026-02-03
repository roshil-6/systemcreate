@echo off
echo ========================================
echo Starting CRM Server...
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found!
    pause
    exit /b 1
)

echo.
echo Checking .env file...
if not exist .env (
    echo ERROR: .env file not found!
    pause
    exit /b 1
)

echo.
echo Starting server...
echo.
node index.js

pause
