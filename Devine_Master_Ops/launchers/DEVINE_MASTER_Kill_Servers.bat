@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0_config.bat" call "%~dp0_config.bat"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0DevineDesk.ps1" kill
if errorlevel 1 pause
exit /b 0
