$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "DEVINE_MASTER_CaptureBridge.lnk"
if (Test-Path $ShortcutPath) {
  Remove-Item $ShortcutPath -Force
  Write-Host "Removed $ShortcutPath"
} else {
  Write-Host "No autostart shortcut found."
}
Write-Host "Stop any running bridge in Task Manager (pythonw/python) if needed."
