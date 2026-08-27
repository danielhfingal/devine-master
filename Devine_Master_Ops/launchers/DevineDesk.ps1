#Requires -Version 5.1
<#
.SYNOPSIS
  DEVINE MASTER desk launcher (HTML / Local / Kill / Install).

.DESCRIPTION
  Resolves Devine_Master_Ops, starts the daily desk + companion tools,
  and can pin Desktop shortcuts. Non-destructive. Does not overwrite audio.

.PARAMETER Action
  html     Local HTTP desk (preferred).
  local    file:// desk + companion processes.
  kill     Stop HTTP server + capture bridge started by this pack.
  install  Copy this folder into Ops\launchers and create Desktop .lnk files.
  status   Print resolved paths / ports (no launch).
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('html', 'local', 'kill', 'install', 'status')]
    [string]$Action = 'html'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:StateName = 'DEVINE_MASTER'
$script:DefaultOps = 'F:\devine-master-fresh\Devine_Master_Ops'
$script:HttpPortStart = 8080
$script:HttpPortEnd = 8099
$script:CapturePort = 8765
$script:CaptureHttpPort = 8766

function Show-Alert {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Error', 'Warning')]
        [string]$Kind = 'Info'
    )
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        $icon = switch ($Kind) {
            'Error' { [System.Windows.Forms.MessageBoxIcon]::Error }
            'Warning' { [System.Windows.Forms.MessageBoxIcon]::Warning }
            default { [System.Windows.Forms.MessageBoxIcon]::Information }
        }
        [void][System.Windows.Forms.MessageBox]::Show(
            $Message,
            'DEVINE MASTER',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            $icon
        )
    }
    catch {
        Write-Host $Message
        if ($Kind -eq 'Error') { Start-Sleep -Seconds 4 }
    }
}

function Get-StateDir {
    $d = Join-Path $env:LOCALAPPDATA $script:StateName
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    return $d
}

function Test-DeskCandidate {
    param([string]$Path)
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $false }
    $names = @(
        'daily\DEVINE_MASTER.html',
        'DEVINE_MASTER.html',
        '01_ACTIVE\DEVINE_MASTER.html'
    )
    foreach ($n in $names) {
        if (Test-Path -LiteralPath (Join-Path $Path $n)) { return $true }
    }
    return $false
}

function Get-OpsRoot {
    if ($env:DEVINE_OPS_ROOT) {
        $forced = $env:DEVINE_OPS_ROOT.Trim('"')
        if (Test-DeskCandidate $forced) {
            return (Resolve-Path -LiteralPath $forced).Path
        }
    }

    $here = $PSScriptRoot
    $parent = Split-Path -Parent $here
    $candidates = @(
        $here,
        $parent,
        (Join-Path $parent 'Devine_Master_Ops'),
        (Join-Path (Split-Path -Parent $parent) 'Devine_Master_Ops'),
        $script:DefaultOps
    )
    foreach ($c in $candidates) {
        if (Test-DeskCandidate $c) {
            return (Resolve-Path -LiteralPath $c).Path
        }
    }

    $cur = $here
    for ($i = 0; $i -lt 8; $i++) {
        if (Test-DeskCandidate $cur) {
            return (Resolve-Path -LiteralPath $cur).Path
        }
        $nxt = Split-Path -Parent $cur
        if (-not $nxt -or $nxt -eq $cur) { break }
        $cur = $nxt
    }
    return $null
}

function Get-DailyHtml {
    param([string]$Ops)
    $cands = @(
        (Join-Path $Ops 'daily\DEVINE_MASTER.html'),
        (Join-Path $Ops 'DEVINE_MASTER.html'),
        (Join-Path $Ops '01_ACTIVE\DEVINE_MASTER.html'),
        (Join-Path $Ops 'lab\DEVINE_MASTER.html')
    )
    foreach ($c in $cands) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
    }
    return $null
}

function Find-FirstFile {
    param([string]$Ops, [string[]]$RelPaths)
    foreach ($r in $RelPaths) {
        $p = Join-Path $Ops $r
        if (Test-Path -LiteralPath $p) { return (Resolve-Path -LiteralPath $p).Path }
    }
    return $null
}

function Get-PythonExe {
    foreach ($name in @('python', 'py')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { return $cmd.Source }
    }
    $guess = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'),
        'C:\Python312\python.exe',
        'C:\Python311\python.exe'
    )
    foreach ($g in $guess) {
        if (Test-Path -LiteralPath $g) { return $g }
    }
    return $null
}

function Test-PortOpen {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(150)
        $connected = $ok -and $client.Connected
        try { $client.Close() } catch { }
        return [bool]$connected
    }
    catch {
        return $false
    }
}

function Find-FreePort {
    param([int]$Start, [int]$End)
    for ($p = $Start; $p -le $End; $p++) {
        if (-not (Test-PortOpen $p)) { return $p }
    }
    return $null
}

function Wait-Port {
    param([int]$Port, [int]$TimeoutMs = 8000)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.ElapsedMilliseconds -lt $TimeoutMs) {
        if (Test-PortOpen $Port) { return $true }
        Start-Sleep -Milliseconds 150
    }
    return $false
}

function Read-PidFile {
    param([string]$Name)
    $fp = Join-Path (Get-StateDir) $Name
    if (-not (Test-Path -LiteralPath $fp)) { return $null }
    $raw = (Get-Content -LiteralPath $fp -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($raw -match '^\s*(\d+)\s*$') { return [int]$Matches[1] }
    return $null
}

function Write-PidFile {
    param([string]$Name, [int]$Id)
    Set-Content -LiteralPath (Join-Path (Get-StateDir) $Name) -Value $Id -Encoding ASCII
}

function Test-ProcessAlive {
    param([int]$Id)
    try {
        $p = Get-Process -Id $Id -ErrorAction Stop
        return $null -ne $p
    }
    catch { return $false }
}

function Get-UrlRelPath {
    param([string]$Ops, [string]$File)
    $opsFull = (Resolve-Path -LiteralPath $Ops).Path.TrimEnd('\')
    $fileFull = (Resolve-Path -LiteralPath $File).Path
    if ($fileFull.StartsWith($opsFull, [StringComparison]::OrdinalIgnoreCase)) {
        $rel = $fileFull.Substring($opsFull.Length).TrimStart('\')
        return ($rel -replace '\\', '/')
    }
    return (Split-Path -Leaf $File)
}

function Test-DeskAlreadyServing {
    param([string]$Ops, [int]$Port, [string]$Html)
    $rel = Get-UrlRelPath $Ops $Html
    $url = "http://127.0.0.1:$Port/$rel"
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Timeout = 800
        $req.ReadWriteTimeout = 800
        $req.Method = 'HEAD'
        $resp = $req.GetResponse()
        $ok = [int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 400
        $resp.Close()
        return $ok
    }
    catch {
        try {
            $req = [System.Net.HttpWebRequest]::Create($url)
            $req.Timeout = 800
            $req.Method = 'GET'
            $resp = $req.GetResponse()
            $ok = [int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 400
            $resp.Close()
            return $ok
        }
        catch { return $false }
    }
}

function Start-MinimizedPython {
    param(
        [string]$Python,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )
    $p = Start-Process -FilePath $Python -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory -WindowStyle Minimized -PassThru
    return $p
}

function Ensure-HttpServer {
    param([string]$Ops, [string]$Html)
    $state = Get-StateDir
    $portFile = Join-Path $state 'html_server.port'
    $pidId = Read-PidFile 'html_server.pid'

    if ($pidId -and (Test-ProcessAlive $pidId) -and (Test-Path -LiteralPath $portFile)) {
        $oldPort = [int]((Get-Content -LiteralPath $portFile | Select-Object -First 1).Trim())
        if (Test-PortOpen $oldPort) { return $oldPort }
    }

    if (Test-PortOpen $script:HttpPortStart) {
        if (Test-DeskAlreadyServing -Ops $Ops -Port $script:HttpPortStart -Html $Html) {
            Set-Content -LiteralPath $portFile -Value $script:HttpPortStart -Encoding ASCII
            return $script:HttpPortStart
        }
        $port = Find-FreePort -Start ($script:HttpPortStart + 1) -End $script:HttpPortEnd
        if (-not $port) {
            throw "No free HTTP port in $($script:HttpPortStart)-$($script:HttpPortEnd)."
        }
    }
    else {
        $port = $script:HttpPortStart
    }

    $py = Get-PythonExe
    if (-not $py) {
        throw 'Python was not found on PATH. Install Python 3 and enable "Add python.exe to PATH".'
    }

    $proc = Start-MinimizedPython -Python $py `
        -ArgumentList @('-m', 'http.server', "$port", '--bind', '127.0.0.1') `
        -WorkingDirectory $Ops
    Write-PidFile 'html_server.pid' $proc.Id
    Set-Content -LiteralPath $portFile -Value $port -Encoding ASCII

    if (-not (Wait-Port -Port $port)) {
        throw "HTTP server started (PID $($proc.Id)) but port $port did not open."
    }
    return $port
}

function Ensure-CaptureBridge {
    param([string]$Ops)
    $scriptPath = Find-FirstFile $Ops @(
        'tools\capture_bridge.py',
        'capture_bridge.py',
        '01_ACTIVE\capture_bridge.py'
    )
    if (-not $scriptPath) { return 'missing' }
    if (Test-PortOpen $script:CapturePort) { return 'already' }

    $py = Get-PythonExe
    if (-not $py) { return 'nopython' }

    $proc = Start-MinimizedPython -Python $py -ArgumentList @($scriptPath) -WorkingDirectory $Ops
    Write-PidFile 'capture_bridge.pid' $proc.Id
    return 'started'
}

function Ensure-CaptureHttp {
    param([string]$Ops)
    $html = Find-FirstFile $Ops @(
        'tools\DEVINE_MASTER_CAPTURE_v2c.html',
        'DEVINE_MASTER_CAPTURE_v2c.html',
        '01_ACTIVE\DEVINE_MASTER_CAPTURE_v2c.html'
    )
    if (-not $html) { return $null }
    if (Test-PortOpen $script:CaptureHttpPort) { return $script:CaptureHttpPort }

    $py = Get-PythonExe
    if (-not $py) { return $null }

    $cwd = Split-Path -Parent $html
    $proc = Start-MinimizedPython -Python $py `
        -ArgumentList @('-m', 'http.server', "$($script:CaptureHttpPort)", '--bind', '127.0.0.1') `
        -WorkingDirectory $cwd
    Write-PidFile 'capture_http.pid' $proc.Id
    [void](Wait-Port -Port $script:CaptureHttpPort -TimeoutMs 4000)
    return $script:CaptureHttpPort
}

function Open-Default {
    param([string]$Target)
    Start-Process -FilePath $Target | Out-Null
}

function Invoke-HtmlDesk {
    $ops = Get-OpsRoot
    if (-not $ops) {
        Show-Alert -Kind Error -Message @"
Could not find DEVINE MASTER.

Looked for daily\DEVINE_MASTER.html under:
  • this script folder / parent
  • $script:DefaultOps

Fix: edit launchers\_config.bat and set DEVINE_OPS_ROOT, then try again.
"@
        exit 1
    }

    $html = Get-DailyHtml $ops
    if (-not $html) {
        Show-Alert -Kind Error -Message "No DEVINE_MASTER.html under:`n$ops"
        exit 1
    }

    try {
        $port = Ensure-HttpServer -Ops $ops -Html $html
    }
    catch {
        Show-Alert -Kind Error -Message $_.Exception.Message
        exit 1
    }

    $bridge = Ensure-CaptureBridge $ops
    $capHttp = Ensure-CaptureHttp $ops
    $rel = Get-UrlRelPath $ops $html
    $url = "http://127.0.0.1:$port/$rel"
    Open-Default $url

    $notes = @("Desk: $url", "Ops: $ops")
    if ($bridge -eq 'started' -or $bridge -eq 'already') {
        $notes += "Capture bridge: 127.0.0.1:$($script:CapturePort)"
    }
    elseif ($bridge -eq 'missing') {
        $notes += 'Capture bridge: not found (desk still opens).'
    }
    if ($capHttp) {
        $notes += "Capture desk: http://127.0.0.1:$capHttp/DEVINE_MASTER_CAPTURE_v2c.html"
    }
    Write-Host ($notes -join [Environment]::NewLine)
}

function Invoke-LocalDesk {
    $ops = Get-OpsRoot
    if (-not $ops) {
        Show-Alert -Kind Error -Message @"
Could not find DEVINE MASTER.

Set DEVINE_OPS_ROOT in launchers\_config.bat
Typical: $script:DefaultOps
"@
        exit 1
    }

    $html = Get-DailyHtml $ops
    if (-not $html) {
        Show-Alert -Kind Error -Message "No DEVINE_MASTER.html under:`n$ops"
        exit 1
    }

    [void](Ensure-CaptureBridge $ops)
    Open-Default $html

    $stem = Find-FirstFile $ops @(
        'STEM_LAB.html',
        'tools\STEM_LAB.html',
        '01_ACTIVE\STEM_LAB.html',
        'daily\STEM_LAB.html'
    )
    if ($stem) { Open-Default $stem }

    Write-Host "Opened file:// desk:`n$html`nOps: $ops"
    Write-Host "Note: capture meters need HTML Desk (http://) not file://."
}

function Stop-TrackedPid {
    param([string]$FileName)
    $id = Read-PidFile $FileName
    if ($id -and (Test-ProcessAlive $id)) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
    $fp = Join-Path (Get-StateDir) $FileName
    if (Test-Path -LiteralPath $fp) { Remove-Item -LiteralPath $fp -Force -ErrorAction SilentlyContinue }
}

function Invoke-Kill {
    Stop-TrackedPid 'html_server.pid'
    Stop-TrackedPid 'capture_bridge.pid'
    Stop-TrackedPid 'capture_http.pid'

    $portFile = Join-Path (Get-StateDir) 'html_server.port'
    if (Test-Path -LiteralPath $portFile) { Remove-Item -LiteralPath $portFile -Force -ErrorAction SilentlyContinue }

    try {
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -match '^(python|pythonw|py)\.exe$' -and
                $_.CommandLine -and
                (
                    $_.CommandLine -match 'http\.server' -or
                    $_.CommandLine -match 'capture_bridge\.py' -or
                    $_.CommandLine -match 'capture_loopback\.py'
                )
            } |
            ForEach-Object {
                Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            }
    }
    catch { }

    Show-Alert -Kind Info -Message "Stopped DEVINE HTTP / capture processes started by this pack."
}

function Get-ShortcutIcon {
    param([string]$Kind)
    $py = Get-PythonExe
    switch ($Kind) {
        'html' {
            if ($py) { return "$py,0" }
            return "$env:SystemRoot\System32\shell32.dll,13"
        }
        'local' { return "$env:SystemRoot\System32\imageres.dll,67" }
        'kill' { return "$env:SystemRoot\System32\shell32.dll,131" }
        default { return "$env:SystemRoot\System32\shell32.dll,1" }
    }
}

function New-DeskShortcut {
    param(
        [string]$Desktop,
        [string]$Name,
        [string]$Target,
        [string]$WorkDir,
        [string]$Description,
        [string]$Icon,
        [int]$WindowStyle = 7
    )
    $W = New-Object -ComObject WScript.Shell
    $path = Join-Path $Desktop "$Name.lnk"
    $sc = $W.CreateShortcut($path)
    $sc.TargetPath = $Target
    $sc.WorkingDirectory = $WorkDir
    $sc.WindowStyle = $WindowStyle
    $sc.Description = $Description
    $sc.IconLocation = $Icon
    $sc.Save()
    return $path
}

function Invoke-Install {
    $here = $PSScriptRoot
    $ops = Get-OpsRoot
    if (-not $ops) {
        Show-Alert -Kind Error -Message @"
Could not find Devine_Master_Ops (daily\DEVINE_MASTER.html).

1. Copy this launchers folder into:
   $script:DefaultOps\launchers
2. Or set DEVINE_OPS_ROOT in _config.bat
3. Run INSTALL_DESKTOP_SHORTCUTS.bat again.
"@
        exit 1
    }

    $dest = Join-Path $ops 'launchers'
    New-Item -ItemType Directory -Force -Path $dest | Out-Null

    $hereFull = (Resolve-Path -LiteralPath $here).Path.TrimEnd('\')
    $destFull = (Resolve-Path -LiteralPath $dest).Path.TrimEnd('\')
    $sameFolder = [string]::Equals($hereFull, $destFull, [StringComparison]::OrdinalIgnoreCase)

    if (-not $sameFolder) {
        Get-ChildItem -LiteralPath $here -File | ForEach-Object {
            $target = Join-Path $dest $_.Name
            if ([string]::Equals($_.FullName, $target, [StringComparison]::OrdinalIgnoreCase)) { return }
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }

    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE 'Desktop' }

    $htmlBat = Join-Path $dest 'DEVINE_MASTER_HTML_Desk.bat'
    $localBat = Join-Path $dest 'DEVINE_MASTER_Local_Desk.bat'
    $killBat = Join-Path $dest 'DEVINE_MASTER_Kill_Servers.bat'

    $a = New-DeskShortcut -Desktop $desktop -Name 'DEVINE MASTER — HTML Desk' `
        -Target $htmlBat -WorkDir $dest `
        -Description 'DEVINE MASTER HTML Desk — local HTTP + browser (preferred)' `
        -Icon (Get-ShortcutIcon 'html') -WindowStyle 7

    $b = New-DeskShortcut -Desktop $desktop -Name 'DEVINE MASTER — Local Desk' `
        -Target $localBat -WorkDir $dest `
        -Description 'DEVINE MASTER Local Desk — open daily HTML via file://' `
        -Icon (Get-ShortcutIcon 'local') -WindowStyle 7

    $c = New-DeskShortcut -Desktop $desktop -Name 'DEVINE MASTER — Kill Servers' `
        -Target $killBat -WorkDir $dest `
        -Description 'Stop DEVINE local HTTP server and capture bridge' `
        -Icon (Get-ShortcutIcon 'kill') -WindowStyle 7

    Show-Alert -Kind Info -Message @"
Desktop shortcuts created.

$a
$b
$c

Scripts live in:
$dest

HTML Desk is the full-featured mode (http://127.0.0.1:8080/...).
Local Desk opens the file directly (no server).
"@
}

function Invoke-Status {
    $ops = Get-OpsRoot
    $html = if ($ops) { Get-DailyHtml $ops } else { $null }
    $py = Get-PythonExe
    Write-Host "OPS     : $(if ($ops) { $ops } else { '(not found)' })"
    Write-Host "DAILY   : $(if ($html) { $html } else { '(not found)' })"
    Write-Host "PYTHON  : $(if ($py) { $py } else { '(not found)' })"
    Write-Host "HTTP8080: $(if (Test-PortOpen 8080) { 'open' } else { 'free' })"
    Write-Host "CAP8765 : $(if (Test-PortOpen 8765) { 'open' } else { 'free' })"
    Write-Host "CAP8766 : $(if (Test-PortOpen 8766) { 'open' } else { 'free' })"
}

switch ($Action) {
    'html' { Invoke-HtmlDesk }
    'local' { Invoke-LocalDesk }
    'kill' { Invoke-Kill }
    'install' { Invoke-Install }
    'status' { Invoke-Status }
}
