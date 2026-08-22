@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo === DEVINE MASTER capture bridge v1.0 ===
echo Repo: %ROOT%
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not on PATH.
  pause
  exit /b 1
)

REM Clear stale listeners on 8765 (old bridges cause ERR_EMPTY_RESPONSE)
echo Checking port 8765...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
  echo Killing stale PID %%P on 8765
  taskkill /PID %%P /F >nul 2>&1
)

python -m pip install -q -r "%ROOT%\tools\requirements-capture.txt"
echo.
echo Starting bridge — leave this window OPEN
echo Prefer Speakers (Realtek) as device 0
echo.
python tools\capture_bridge.py --device "Speakers (Realtek High Definition Audio)"
if errorlevel 1 python tools\capture_bridge.py
pause
