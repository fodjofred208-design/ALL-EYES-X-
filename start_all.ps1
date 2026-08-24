<#
ALL EYES X — unified Windows 10 Pro development launcher.
Starts Caddy, Flask, Vite and the local client agent with separate logs.
Components remain runnable individually.
#>
param(
  [switch]$NoCaddy,
  [switch]$NoClient,
  [string]$Python = "python",
  [string]$Npm = "npm.cmd",
  [string]$Caddy = "caddy.exe",
  [string]$ServerUrl = "http://127.0.0.1:5000"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-Port([int]$Port) {
  try {
    $client = New-Object Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(250, $false)
    if ($ok) { $client.EndConnect($iar) }
    $client.Close()
    return $ok
  } catch { return $false }
}

function Start-AexProcess([string]$Name, [string]$FilePath, [string]$Arguments, [string]$WorkingDirectory, [int]$Port = 0) {
  if ($Port -gt 0 -and (Test-Port $Port)) {
    Write-Host "[SKIP] $Name already appears to be listening on port $Port" -ForegroundColor Yellow
    return
  }
  $Out = Join-Path $LogDir "$Name.out.log"
  $Err = Join-Path $LogDir "$Name.err.log"
  Write-Host "[START] $Name" -ForegroundColor Green
  Write-Host "        logs: $Out / $Err" -ForegroundColor DarkGray
  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $Out -RedirectStandardError $Err -WindowStyle Minimized | Out-Null
}

Write-Host "=============================================" -ForegroundColor Green
Write-Host " ALL EYES X — Development Launcher" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "Root: $Root"
Write-Host "Logs: $LogDir"

if (-not $NoCaddy) {
  Start-AexProcess -Name "caddy" -FilePath $Caddy -Arguments "run --config `"$Root\caddy\caddyfile`"" -WorkingDirectory $Root -Port 8080
}

Start-AexProcess -Name "flask" -FilePath $Python -Arguments "server\app.py" -WorkingDirectory $Root -Port 5000
Start-AexProcess -Name "vite" -FilePath $Npm -Arguments "run dev -- --host 0.0.0.0" -WorkingDirectory $Root -Port 5173

if (-not $NoClient) {
  Start-AexProcess -Name "client" -FilePath $Python -Arguments "client\client.py $ServerUrl" -WorkingDirectory $Root -Port 0
}

Write-Host ""
Write-Host "Open via Caddy:   http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host "Vite direct:      http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "Flask API:        http://127.0.0.1:5000" -ForegroundColor Cyan
Write-Host "Use logs\*.log to inspect every activity printed by app.py/client.py." -ForegroundColor Cyan
