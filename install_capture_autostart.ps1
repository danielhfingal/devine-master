# One-time: start capture bridge at Windows logon (no PowerShell each session)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Bridge = Join-Path $Root "tools\capture_bridge.py"
if (-not (Test-Path $Bridge)) { throw "Missing $Bridge" }

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "DEVINE_MASTER_CaptureBridge.lnk"

$pythonw = (Get-Command pythonw -ErrorAction SilentlyContinue)?.Source
if (-not $pythonw) { $pythonw = (Get-Command python).Source }

$W = New-Object -ComObject WScript.Shell
$S = $W.CreateShortcut($ShortcutPath)
$S.TargetPath = $pythonw
$S.Arguments = "`"$Bridge`""
$S.WorkingDirectory = "$Root"
$S.WindowStyle = 7  # minimized
$S.Description = "DEVINE MASTER capture bridge (127.0.0.1:8765)"
$S.Save()

Write-Host "Installed autostart: $ShortcutPath"
Write-Host "Starting bridge now..."
Start-Process -FilePath $pythonw -ArgumentList "`"$Bridge`"" -WorkingDirectory "$Root" -WindowStyle Minimized
Write-Host "Done. Open DEVINE MASTER and press Record — no PowerShell needed each time."
Write-Host "To remove: delete the shortcut in shell:startup"
