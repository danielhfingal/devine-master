@echo off
setlocal
title DEVINE MASTER — install desktop shortcuts
cd /d "%~dp0"
if exist "%~dp0_config.bat" call "%~dp0_config.bat"
echo Installing DEVINE MASTER desktop shortcuts...
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0DevineDesk.ps1" install
if errorlevel 1 (
  echo Install failed.
  pause
  exit /b 1
)
exit /b 0
