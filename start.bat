@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Gridsmith - install, build, and serve
echo ================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm not found.
  echo Install Node.js LTS first: https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem Stop any previous server first so it doesn't lock node_modules during install.
echo Stopping any running server on port 4173...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr LISTENING ^| findstr :4173') do taskkill /F /PID %%p >nul 2>nul
echo.

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 goto :error
echo.

echo [2/3] Building...
call npm run build
if errorlevel 1 goto :error
echo.

echo [3/3] Starting server ^(LAN accessible^)...
echo.
echo   Local:   http://localhost:4173
echo   Network: http://^<this-PC-IP^>:4173   ^(run "ipconfig" to find the IP^)
echo.
echo   Press Ctrl+C to stop.
echo.
call npm run serve
goto :eof

:error
echo.
echo *** Setup failed. See the messages above. ***
pause
exit /b 1
