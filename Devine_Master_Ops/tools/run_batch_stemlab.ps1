# Devine Master · batch Stem Lab (catalogue)
# Run from Ops root in PowerShell.
#
# Full-set for every master (default AudioDir):
#   .\tools\run_batch_stemlab.ps1 -FullSet
#
# Full-set + drums/bass solos:
#   .\tools\run_batch_stemlab.ps1 -FullSet -Solo "drums,bass"
#
# List only:
#   .\tools\run_batch_stemlab.ps1 -ListOnly

param(
  [string]$AudioDir = "F:\devine-master-fresh\Audio",

  [string]$AnalysisDir = "",

  [switch]$FullSet,

  [string]$Solo = "",

  [switch]$Force,

  [double]$MaxSeconds = 90,

  [int]$Limit = 0,

  [switch]$ListOnly,

  [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$OpsRoot = Split-Path -Parent $PSScriptRoot
if (-not $OpsRoot) { $OpsRoot = (Get-Location).Path }

# PYTHONPATH: Ops (if sourcecast here) + common repo roots
$paths = @($OpsRoot)
foreach ($cand in @(
  (Join-Path $OpsRoot "sourcecast"),
  (Join-Path $OpsRoot "..\sourcecast"),
  (Join-Path $OpsRoot "..\devine-master\sourcecast"),
  (Join-Path $OpsRoot "..\..\devine-master\sourcecast")
)) {
  if (Test-Path $cand) {
    $paths += (Resolve-Path (Split-Path -Parent $cand)).Path
  }
}
$env:PYTHONPATH = ($paths -join ";")

if (-not $AnalysisDir) {
  $AnalysisDir = Join-Path $OpsRoot "tracks\analysis"
}

$pyArgs = @(
  (Join-Path $PSScriptRoot "batch_stemlab.py"),
  "--audio-dir", $AudioDir,
  "--analysis-dir", $AnalysisDir,
  "--max-seconds", "$MaxSeconds"
)

if ($FullSet) { $pyArgs += "--full-set" }
if ($Solo) { $pyArgs += @("--solo", $Solo) }
if ($Force) { $pyArgs += "--force" }
if ($Limit -gt 0) { $pyArgs += @("--limit", "$Limit") }
if ($ListOnly) { $pyArgs += "--list-only" }
if ($Verbose) { $pyArgs += "-v" }

Write-Host "OpsRoot     $OpsRoot"
Write-Host "AudioDir    $AudioDir"
Write-Host "AnalysisDir $AnalysisDir"
Write-Host "PYTHONPATH  $env:PYTHONPATH"
Write-Host "python $($pyArgs -join ' ')"

python @pyArgs
exit $LASTEXITCODE
