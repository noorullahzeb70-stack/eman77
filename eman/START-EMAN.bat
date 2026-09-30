@echo off
title EMAN
cd /d "%~dp0"
echo.
echo   ======================================
echo      EMAN  -  AI . Education . Knowledge
echo   ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed.
  echo   Your browser will open the download page. Install the "LTS" version,
  echo   then double-click START-EMAN.bat again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 22 (
  echo   Your Node.js is too old. EMAN needs version 22 or newer.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist ".env" (
  echo   First run: creating your private settings file...
  node scripts\setup-env.mjs || goto fail
)

if not exist "node_modules" (
  echo   Installing EMAN - this takes 1-3 minutes the first time...
  call npm install --no-audit --no-fund || goto fail
)

echo   Building EMAN...
call npm run build || goto fail

echo.
echo   EMAN is starting at http://localhost:3000
echo   Keep this window open while you use EMAN. Close it to stop EMAN.
echo.
start "" http://localhost:3000
call npm start
goto end

:fail
echo.
echo   Something went wrong. Take a photo of this window and send it to Claude.
pause
exit /b 1

:end
pause
