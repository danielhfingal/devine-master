# After catalogue separation: write analysis JSON for every complete stem folder.
# Run from Ops (PowerShell). Bypasses execution-policy issues when invoked with:
#   powershell -ExecutionPolicy Bypass -File .\tools\stem_bridge\run_postbatch_analyse.ps1

param(
  [string]$Report = "",
  [switch]$Force,
  [int]$Limit = 0,
  [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$OpsRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $OpsRoot

$py = Join-Path $PSScriptRoot "catalogue_analyse.py"
$args = @($py)
if ($Report) { $args += @("--from-report", $Report) }
if ($Force) { $args += "--force" }
if ($Limit -gt 0) { $args += @("--limit", "$Limit") }
if ($Verbose) { $args += "-v" }

Write-Host "OpsRoot $OpsRoot"
Write-Host "python $($args -join ' ')"
python @args
exit $LASTEXITCODE
