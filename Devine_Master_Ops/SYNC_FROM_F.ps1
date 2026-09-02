# F: is source of truth. Push Ops (lab + daily desk + analysis JSON) to GitHub.
# Does NOT git pull. Does NOT overwrite daily HTML from remote.
$ErrorActionPreference = "Stop"
$Ops = "F:\devine-master-fresh\Devine_Master_Ops"
$Repo = "F:\devine-master-fresh"
if (-not (Test-Path -LiteralPath (Join-Path $Repo ".git"))) {
  Write-Host "No .git at $Repo — clone is not this folder. Abort (will not guess)."
  exit 1
}
Set-Location $Repo
git status -sb
Write-Host "Staging Ops lab/scripts, lab/runs (json), daily HTML, QUALITY docs. Skipping Audio/wav/zip."
git add -A -- "Devine_Master_Ops/lab/scripts" "Devine_Master_Ops/QUALITY_SEQUENCE.md" "Devine_Master_Ops/RUN_QUALITY_BATCH.ps1" "Devine_Master_Ops/EXTRACT_AND_OPEN.ps1" "Devine_Master_Ops/SYNC_FROM_F.ps1" "Devine_Master_Ops/F_PUSH_SYNC_NOTE.md"
if (Test-Path "Devine_Master_Ops/daily/DEVINE_MASTER.html") {
  git add -- "Devine_Master_Ops/daily/DEVINE_MASTER.html"
}
if (Test-Path "Devine_Master_Ops/lab/runs") {
  git add -- "Devine_Master_Ops/lab/runs/*.json"
}
if (Test-Path "Devine_Master_Ops/tracks/analysis") {
  git add -- "Devine_Master_Ops/tracks/analysis/*.json"
}
git status -sb
$msg = "sync: F Ops lab+analysis+desk $(Get-Date -Format s)"
git commit -m $msg
git push origin HEAD
Write-Host "Pushed from F: (source of truth)."
