@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0_config.bat" call "%~dp0_config.bat"

if /I not "%~1"=="__min" (
  start "DEVINE MASTER HTML Desk" /min cmd /c ""%~f0" __min"
  exit /b 0
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0DevineDesk.ps1" html
if errorlevel 1 (
  echo.
  echo HTML Desk failed. See the message box, or run:
  echo   powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0DevineDesk.ps1" status
  pause
  exit /b 1
)
exit /b 0
