@echo off
title Careyu Automation — Project Hub (LIVE)
color 0A

echo ============================================================
echo   CAREYU AUTOMATION — PROJECT HUB
echo   Production servers starting...
echo ============================================================
echo.

cd /d "%~dp0"

echo  Frontend : http://localhost:3000
echo  Backend  : http://localhost:4000
echo.
echo  Press Ctrl+C to stop the servers.
echo ============================================================
echo.

powershell -ExecutionPolicy Bypass -Command "npm start"

pause
