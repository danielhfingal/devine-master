@echo off
REM DEVINE MASTER — one click: bridge (background) + lab desk
set ROOT=%~dp0..
cd /d "%ROOT%"

if not exist "%ROOT%\tools\capture_bridge.py" (
  echo Missing tools\capture_bridge.py
  pause
  exit /b 1
)

REM Prefer pythonw so no console stays open
where pythonw >nul 2>&1
if %ERRORLEVEL%==0 (
  start "DevineCaptureBridge" /MIN pythonw tools\capture_bridge.py
) else (
  start "DevineCaptureBridge" /MIN python tools\capture_bridge.py
)

REM Give the bridge a moment to bind 8765
timeout /t 2 /nobreak >nul

REM Open lab desk (prefer newest canonical name)
if exist "%ROOT%\DEVINE_MASTER_Lab_StudioDraft.html" (
  start "" "%ROOT%\DEVINE_MASTER_Lab_StudioDraft.html"
) else if exist "%ROOT%\DEVINE_MASTER_Lab_StudioDraft (41).html" (
  start "" "%ROOT%\DEVINE_MASTER_Lab_StudioDraft (41).html"
) else (
  echo Open your lab HTML manually from the repo folder.
)

echo Bridge starting on http://127.0.0.1:8765 — you can close this window.
timeout /t 3 /nobreak >nul
