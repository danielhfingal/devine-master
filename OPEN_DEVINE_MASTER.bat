@echo off
REM Always open the fixed desk path — do not hunt versioned HTML names
set ROOT=%~dp0
if exist "%ROOT%DEVINE_MASTER.html" (
  start "" "%ROOT%DEVINE_MASTER.html"
  exit /b 0
)
if exist "%ROOT%lab\DEVINE_MASTER.html" (
  start "" "%ROOT%lab\DEVINE_MASTER.html"
  exit /b 0
)
echo DEVINE_MASTER.html not found next to this launcher.
echo Copy DEVINE_MASTER.html into this folder from the project artifacts.
pause
