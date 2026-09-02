@echo off
set ROOT=%~dp0
set DESK=%ROOT%Devine_Master_Ops\daily\DEVINE_MASTER.html
if not exist "%DESK%" (
  echo Missing: Devine_Master_Ops\daily\DEVINE_MASTER.html
  pause
  exit /b 1
)
start "" "%DESK%"
exit /b 0
