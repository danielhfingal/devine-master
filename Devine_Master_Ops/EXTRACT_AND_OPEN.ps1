# DEVINE MASTER — extract zip into Ops and open the desk
$ErrorActionPreference = "Stop"
$Ops = "F:\devine-master-fresh\Devine_Master_Ops"
if (-not (Test-Path -LiteralPath $Ops)) { Write-Host "Ops not found: $Ops"; exit 1 }

$candidates = @()
$candidates += Get-ChildItem -LiteralPath (Get-Location).Path -Filter "DEVINE_MASTER_*Ops.zip" -EA SilentlyContinue
$candidates += Get-ChildItem -LiteralPath $Ops -Filter "DEVINE_MASTER_*Ops.zip" -EA SilentlyContinue
$dl = Join-Path $env:USERPROFILE "Downloads"
if (Test-Path $dl) { $candidates += Get-ChildItem -LiteralPath $dl -Filter "DEVINE_MASTER_*Ops.zip" -EA SilentlyContinue }
$zip = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { Write-Host "No DEVINE_MASTER_*Ops.zip found"; exit 1 }

$staging = Join-Path $env:TEMP "dm_ops_drop"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Expand-Archive -LiteralPath $zip.FullName -DestinationPath $staging -Force
$src = Join-Path $staging "daily\DEVINE_MASTER.html"
if (-not (Test-Path $src)) { Write-Host "Zip missing daily\DEVINE_MASTER.html"; exit 1 }

foreach ($d in @("daily","01_ACTIVE")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Ops $d) | Out-Null
}
Copy-Item $src (Join-Path $Ops "daily\DEVINE_MASTER.html") -Force
Copy-Item $src (Join-Path $Ops "01_ACTIVE\DEVINE_MASTER.html") -Force
Copy-Item $src (Join-Path $Ops "DEVINE_MASTER.html") -Force
Write-Host "Installed from $($zip.Name) -> daily + 01_ACTIVE"

$bat = Join-Path $Ops "START_DEVINE_DESK.bat"
if (Test-Path $bat) { Start-Process $bat }
else { Start-Process (Join-Path $Ops "daily\DEVINE_MASTER.html") }
