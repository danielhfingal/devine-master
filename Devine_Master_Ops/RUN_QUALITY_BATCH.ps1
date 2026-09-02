param(
  [ValidateSet('measure','gate','master')][string]$Mode = 'gate',
  [string]$AudioRoot = 'F:\devine-master-fresh\Audio',
  [string]$Presets = 'devine,spotify,match',
  [int]$Limit = 0,
  [switch]$IncludeStems
)
$ErrorActionPreference = 'Stop'
$Ops = $PSScriptRoot
Set-Location $Ops
Write-Host "Ops=$Ops mode=$Mode audio=$AudioRoot"
python -m pip install -q numpy soundfile
$argsList = @('lab\scripts\quality_batch.py','--audio-root', $AudioRoot, '--mode', $Mode, '--presets', $Presets)
if ($Limit -gt 0) { $argsList += @('--limit', "$Limit") }
if ($IncludeStems) { $argsList += @('--include-stems') }
python @argsList
