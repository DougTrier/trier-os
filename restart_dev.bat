@echo off
title Trier OS - Dev Restart
echo.
echo  ================================================================
echo   Trier OS - Restarting Dev Servers
echo  ================================================================
echo.

echo  Stopping any running dev servers...
taskkill /F /IM node.exe /T >nul 2>&1

echo  Starting dev:full (API + Vite frontend)...
echo.
cd /d "%~dp0"
npm run dev:full
