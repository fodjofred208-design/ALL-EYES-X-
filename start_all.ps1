<#
ALL EYES X — unified Windows 10 Pro development launcher.
Starts Caddy, Flask, Vite and the local client agent with separate logs.
Components remain runnable individually.
#>
param(
  [switch]$NoCaddy,
  [switch]$NoClient,
  [switch]$Serve,
  [string]$Python = "python",
  [string]$Npm = "npm.cmd",
  [string]$Caddy = "caddy.exe",
  [string]$Tailscale = "tailscale.exe",
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

# ---------------------------------------------------------------------------
# Remote HTTPS access via Tailscale Serve.
#
# Caddy listens on :8080 over plain HTTP, so nothing answers on port 443 and
# https://<machine>.<tailnet>.ts.net cannot reach the dashboard on its own.
# `tailscale serve` terminates TLS for the magicDNS name and forwards to the
# local Caddy port. Opt-in with -Serve because it changes tailnet state and
# needs operator rights (tailscale set --operator=$env:USERNAME), and HTTPS
# certificates must be enabled for the tailnet in the admin console.
# ---------------------------------------------------------------------------
if ($Serve) {
  if (-not $NoCaddy) {
    Write-Host "[SERVE] tailscale serve --bg --https=443 http://127.0.0.1:8080" -ForegroundColor Green
    & $Tailscale serve --bg --https=443 http://127.0.0.1:8080
  } else {
    Write-Host "[SERVE] skipped: -NoCaddy was given, nothing is listening on 8080" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Open locally:     http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host "Vite direct:      http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "Flask API:        http://127.0.0.1:5000" -ForegroundColor Cyan
if ($Serve) {
  Write-Host "Remote HTTPS:     https://<machine>.<tailnet>.ts.net (via tailscale serve)" -ForegroundColor Cyan
} else {
  Write-Host "Remote access:    re-run with -Serve to publish https://<machine>.<tailnet>.ts.net" -ForegroundColor Cyan
}
Write-Host "Use logs\*.log to inspect every activity printed by app.py/client.py." -ForegroundColor Cyan
