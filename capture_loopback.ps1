# DEVINE MASTER — arm loopback capture (run from repo root or tools/)
$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $MyInvocation.MyCommand.Path -Parent) -Parent
if (-not (Test-Path "$Root\tools\capture_loopback.py")) {
  $Root = Get-Location
}
Set-Location $Root
Write-Host "DEVINE MASTER loopback capture" -ForegroundColor Cyan
Write-Host "Repo: $Root"
python -m pip install -q -r tools\requirements-capture.txt
python tools\capture_loopback.py @args
