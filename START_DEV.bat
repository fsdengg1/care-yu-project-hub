@echo off
title Careyu Automation � Project Hub (DEV)
cd /d "%~dp0"

echo Starting backend (http://localhost:4000) and frontend (http://localhost:3000)
echo.

powershell -ExecutionPolicy Bypass -Command "npm run dev"

pause
