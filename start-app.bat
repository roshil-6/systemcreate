@echo off
echo Starting CRM System...

:: Start Backend and Frontend concurrently using the root script
cd /d "%~dp0"
npm run dev

pause
