# ALL EYES X — Neural Cyber Intelligence Platform

ALL EYES X is a cybersecurity command-center and authorized remote administration platform. It includes a React/Vite dashboard, Flask + Socket.IO backend, SQLite persistence, and a cross-platform Python client agent.

> Use ALL EYES X only on devices and networks you own or are explicitly authorized to administer.

---

## 1. Current architecture

```text
Browser / React Dashboard
        ↓
Vite dev server :5173
        ↓
Caddy reverse proxy :8080
        ↓
Flask API + Socket.IO :5000
        ↓
SQLite database server/aeyes_data.db
        ↑
client.py agents
        ↑
Windows / Linux / macOS / Android / limited iOS-like Python environments
```

For remote networks, use Tailscale where possible:

```text
Remote client.py → Tailscale IP of ALL EYES X server → Flask :5000
Admin browser    → Caddy :8080 or Vite :5173
```

---

## 2. Required software

### Server machine

Install:

```text
Python 3.10+
Node.js 20+
Git
Caddy
Tailscale, recommended for remote clients
Visual Studio Code, optional but recommended
```

### Client machines

Install:

```text
Python 3.10+
Nmap, optional but required for Nmap scans
Tailscale, recommended for remote access
```

---

## 3. Install dependencies

From the project root:

```powershell
npm install
pip install -r requirements.txt
```

Recommended Python client extras:

```powershell
pip install requests psutil pillow mss pyautogui opencv-python pynput
```

For Nmap scanning, install Nmap and verify:

```powershell
nmap --version
```

Nmap download:

```text
https://nmap.org/download.html
```

---

## 4. Start the system on Windows

Recommended:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start_all.ps1
```

This starts:

```text
Caddy
Flask backend
Vite frontend
local client agent
```

Open:

```text
http://127.0.0.1:8080
```

or Vite directly:

```text
http://127.0.0.1:5173
```

To run the server without starting a local client:

```powershell
.\start_all.ps1 -NoClient
```

---

## 5. Manual startup commands

### Backend

```powershell
python server\app.py
```

### Frontend

```powershell
npm run dev
```

### Caddy

```powershell
caddy.exe run --config caddy\caddyfile
```

### Client agent

```powershell
python client\client.py http://127.0.0.1:5000
```

---

## 6. Login

Default development login:

```text
Username: admin
Password: FRED123
```

After repeated failed attempts, the login enters security lock state. To recover:

```text
KING FFF
```

The recovery field intentionally shows no visible writing while you type.

For production, change secrets with environment variables:

```powershell
$env:ADMIN_USER="your-admin"
$env:ADMIN_PASS="your-strong-password"
$env:SECRET_KEY="a-long-random-secret"
```

For the recovery phrase, prefer a hash:

```powershell
$env:RECOVERY_PHRASE_HASH="sha256_hex_digest_here"
```

---

## 7. Remote client setup

On your ALL EYES X server, find the server IP.

For LAN:

```powershell
ipconfig
```

For Tailscale:

```powershell
tailscale ip -4
```

On the remote machine:

```powershell
python client\client.py http://YOUR_SERVER_IP:5000
```

Example using Tailscale:

```powershell
python client\client.py http://100.104.145.118:5000
```

The device should appear in the dashboard under Devices and Command Center.

---

## 8. Client.py platform support

`client.py` is designed to run gracefully across platforms. It reports a capability profile to the server so unsupported features do not crash the agent.

| Platform | Telemetry | Hardware inventory | Screenshot | Webcam | Remote input | Nmap | Persistence |
|---|---:|---:|---:|---:|---:|---:|---:|
| Windows | Yes | Yes | Yes | Yes | Yes | Yes | Optional |
| Linux | Yes | Yes | Yes | Yes | Yes | Yes | Optional |
| macOS | Yes | Yes | Yes | Yes | Yes | Yes | Optional |
| Android / Termux | Yes | Partial | Limited | Partial | No | Yes | No |
| iOS-like Python environments | Basic only | Limited | No | No | No | No | No |

### Important iOS note

Normal iOS does not allow a Python process to behave like a persistent background system agent. ALL EYES X can only run in limited mode in environments such as iSH/Pythonista-like apps, and only basic telemetry should be expected.

### Android note

Use Termux. For improved Android support:

```bash
pkg update
pkg install python nmap
pip install requests psutil
```

Optional Termux API features may require Termux:API.

---

## 9. Streaming profiles

The client supports FPS targets:

```text
low       30–40 FPS target
balanced 50 FPS target
high      up to 60 FPS target
```

Set before running the client:

```powershell
$env:ALLEYESX_STREAM_PROFILE="high"
python client\client.py http://YOUR_SERVER_IP:5000
```

Linux/macOS:

```bash
export ALLEYESX_STREAM_PROFILE=high
python3 client/client.py http://YOUR_SERVER_IP:5000
```

You can also override intervals:

```powershell
$env:ALLEYESX_SCREENSHOT_INTERVAL="0.016"
$env:ALLEYESX_WEBCAM_INTERVAL="0.016"
```

---

## 10. Terminal commands

The Terminal page supports 50+ managed administrative commands. Examples:

```text
sys_info
ip_config
net_stat
listening_ports
firewall_status
defender_status
process_list
services_list
scheduled_tasks
event_errors
usb_devices
reboot
shutdown
```

Raw shell commands are disabled by default. For an authorized lab only:

```powershell
$env:ALLEYESX_ALLOW_RAW_COMMANDS="1"
python client\client.py http://YOUR_SERVER_IP:5000
```

Then in terminal:

```text
shell:whoami
```

---

## 11. Nmap integration

ALL EYES X includes a proper Nmap workflow:

```text
Security page → Authorized Nmap Scanner → Backend API → security_scans table → client.py executes Nmap → result stored/displayed
```

Supported scan types:

```text
ping        Host discovery
top_ports   Top 100 TCP ports
service     Service/version detection
os          OS guess
udp_light   Light UDP scan
vuln_safe   Safe vulnerability scripts
```

Use from the Security page:

1. Select agent/device.
2. Enter target.
3. Select scan type.
4. Click `START NMAP`.

Allowed targets by default:

```text
Private LAN ranges
Tailscale 100.64.0.0/10
Explicitly authorized public ranges
```

Examples:

```text
192.168.1.10
192.168.1.0/24
10.0.0.0/24
100.104.145.118
```

To allow a public IP/range you own:

```powershell
$env:AEX_AUTHORIZED_PUBLIC_SCAN_TARGETS="203.0.113.10/32"
```

---

## 12. Persistence and sensitive capabilities

Persistence is disabled by default. Enable only when authorized:

```powershell
$env:ALLEYESX_ENABLE_PERSISTENCE="1"
python client\client.py http://YOUR_SERVER_IP:5000
```

Input diagnostic capture is also disabled by default:

```powershell
$env:ALLEYESX_ENABLE_KEYLOG_DIAGNOSTIC="1"
```

Remote administration should always be visible, authorized, and logged.

---

## 13. Firewall ports

Allow on the ALL EYES X server:

```text
5000 TCP  Flask API / client agent communication
8080 TCP  Caddy dashboard
5173 TCP  Vite dev frontend
```

For remote use, prefer Tailscale and avoid exposing administrative interfaces directly to the public internet.

---

## 14. Troubleshooting

### npm error: Missing script dev

You are likely in the wrong folder or using an old download. In the project root, you must see:

```text
package.json
src
server
client
```

Then run:

```powershell
npm install
npm run dev
```

### Login does not work

Make sure the backend is running:

```text
http://127.0.0.1:5000/api/auth/status
```

Then login with:

```text
admin / FRED123
```

### Client does not appear

Check that the client points to the Flask API:

```powershell
python client\client.py http://YOUR_SERVER_IP:5000
```

Check firewall and Tailscale connectivity.

### Server console flooded with ConnectionAbortedError [WinError 10053]

```text
ConnectionAbortedError: [WinError 10053] An established connection was
aborted by the software in your host machine
```

This is caused by the client opening a new TCP socket for every poll while the
server is still writing the response. Two fixes are already built in:

1. `client.py` now reuses one persistent keep-alive connection for all
   heartbeat / touch / screenshot / webcam requests instead of opening a new
   socket per request.
2. `server/app.py` collapses these harmless socket-abort tracebacks into a
   single line so they no longer hide real activity:

```text
[NET] client closed connection early - ignored (...) [suppressed tracebacks: 7]
```

Real errors (ValueError, KeyError, database errors) are still printed in full.

If you still see heavy churn, raise the touch poll interval:

```powershell
$env:ALLEYESX_TOUCH_POLL_INTERVAL="1.0"
python client\client.py http://YOUR_SERVER_IP:5000
```

Default touch polling is now `0.5s` instead of the previous `0.05s` (20
requests per second per agent), which was the main source of the noise on a
modest Windows 10 Pro machine.

### Nmap scan fails

Verify Nmap is installed on the client machine:

```powershell
nmap --version
```

Also verify the target is private/Tailscale or explicitly authorized.

---

## 15. Development commands

```powershell
npm run dev
npm run build
npm run typecheck
python server\app.py
python client\client.py http://127.0.0.1:5000
```

---

## 16. GitHub branch

Updated development branch:

```text
arena/01a03556-all-eyes-x
```

Download ZIP:

```text
https://github.com/fodjofred208-design/ALL-EYES-X-/archive/refs/heads/arena/01a03556-all-eyes-x.zip
```
