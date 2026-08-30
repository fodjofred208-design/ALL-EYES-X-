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
pip install requests psutil pillow mss pyautogui opencv-python pynput numpy
```

`numpy` is required for dirty-rectangle streaming. Without it the agent still
streams, but it silently falls back to sending every frame whole, which uses far
more bandwidth. `opencv-python` normally pulls it in; it is listed explicitly so
a partial install cannot quietly downgrade the stream.

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

### Reading a finished scan

Each scan row in the panel is **clickable**. Collapsed it shows a one-line summary
of the first six ports. Click it to expand into the full result:

```text
PORT   PROTO   STATE   SERVICE   VERSION
22     tcp     open    ssh       OpenSSH 8.9
445    tcp     open    microsoft-ds
3389   tcp     open    ms-wbt-server
```

Expanded rows also give you:

```text
Download report   → plain-text report of that scan
Refresh           → re-fetch the scan list
```

While the agent has not reported back yet the row shows `running…`; it flips to
`completed` or `failed` on its own.

### Report format

`Download report` produces a text file named `alleyesx-scan-<id>.txt`:

```text
ALL EYES X - SCAN REPORT
============================================================
Scan ID     : 84b72cb3-763e-4228-85f7-c54eb444545e
Type        : service
Target      : 192.168.1.10
Status      : completed
Requested by: admin
Queued at   : 2026-08-29T08:45:30
Completed at: 2026-08-29T08:45:31
============================================================

OPEN PORTS
------------------------------------------------------------
PORT      PROTO   STATE     SERVICE           VERSION
22        tcp     open      ssh               OpenSSH 8.9
445       tcp     open      microsoft-ds
```

Discovery scans list hosts instead, and flag which ones already run an agent:

```text
HOSTS
------------------------------------------------------------
10.0.0.1           gateway.local            state=up  agent=no
10.0.0.31          shell-a                  state=up  agent=yes
```

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

## 14. Command Center scope (Target Node)

The **Target Node** selector in the header drives the whole Command Center.

```text
ALL EYES STAT   → aggregate statistics for the entire system
<device>        → every panel is limited to that one device
```

Selecting a device makes the dashboard call:

```text
GET /api/dashboard?device_id=<id>
```

Device totals, CPU/RAM/disk charts, traffic and the security score all follow
the selection. The badge next to the title shows the active scope.

---

## 15. More Feature panels

Each monitoring page has a square **Multi-\*** tile that opens the full
multi-device page:

| Page          | Tile          | Opens          |
|---------------|---------------|----------------|
| Live Monitor  | Multi-Monitor | `/device-wall` |
| Webcam        | Multi-Cam     | `/device-wall` |
| Touch Control | Multi-Touch   | `/device-wall` |
| Terminal      | Multi-Shell   | `/multi-shell` |

### Resizing the tiles

Every tile on those two pages can be resized by dragging, the same way you drag
the corner of a shape in a drawing program:

- **8 handles** — 4 corners and 4 edges. They appear when the pointer is over the
  tile.
- **Drag** a handle to make that tile bigger or smaller. A live `width × height`
  readout follows the drag.
- **Double-click** any handle to put that one tile back to its default size.
- **Reset** (top right of the page) returns every tile on the page to default.
- Sizes are remembered **per device** in `localStorage`, and Multi-Shell keeps
  Main and Solo layouts separately, so switching mode does not clobber them.
- Works with touch as well as a mouse.

Both pages lay tiles out with flex-wrap rather than a CSS grid: a grid stretches
every cell to the tallest in its row, which would silently undo a manual resize.
Default sizes are derived from the row's measured width, so a wall nobody has
resized still reads as the same 1 / 2 / 3-across layout.

Gestures still available on a wall tile: **triple click** zooms in, **double
click** zooms out, clicking the hostname sets it as Target Node.

---

## 16. Data Check (Live Monitor)

The **Data Check** panel shows only values the system can actually measure:

```text
Frame Rate      measured server-side from frame arrival timestamps
Latency         browser-measured
Frame Size      KB per frame
Changed Pixels  percentage of the frame that changed
Resolution      canvas width × height
Encoding        JPEG (change-aware dirty rectangles)
Transport       socket.io or http
Last Frame      seconds since the newest frame arrived
```

Anything not yet measurable renders as `—`. Nothing is simulated.

---

## 17. Zoom

Live Monitor and Touch Monitor both have zoom controls:

```text
−   zoom out (minimum 100%)
+   zoom in  (maximum 400%)
Fit reset to 100%
```

On Live Monitor you can also drag to pan while zoomed. On Touch Monitor zoom is
visual only, so the coordinates sent to the agent stay correct.

---

## 18. Remote control (Touch Monitor)

```text
TAKE CONTROL   → announces and takes control
RELEASE CONTROL → hands control back
```

The remote user is **notified, not asked for consent**. The agent shows a
visible on-screen notice:

```text
An ALL EYES X administrator has taken temporary control of this device.
```

Every takeover is recorded in `remote_sessions` and `audit_log`, and raises a
notification:

```text
REMOTE CONTROL: admin took control of <hostname>
```

Both endpoints require login. Unauthenticated calls return `401`.

---

## 19. Webcam is opt-in

The camera is **off by default**. The agent only captures frames after an
administrator explicitly starts it:

```text
POST /api/webcam/<device_id>/start    → starts capture
POST /api/webcam/<device_id>/switch   → front/back
POST /api/webcam/<device_id>/stop     → stops capture
```

These endpoints require login. Each start writes:

```text
audit_log  → webcam_start, actor recorded
activity   → WEBCAM START | device_id=... host=... by=admin
notify     → CAMERA ACTIVE: admin opened the camera on <hostname>
```

---

## 20. Device icons

The Target Node list shows a neutral monitor when a device is **offline**, and
switches to that device's operating-system logo when it comes **online**:

```text
Windows → Windows logo
Linux   → Tux penguin
macOS   → Apple logo
Android → Android robot
iOS     → iPhone outline
unknown → lit monitor
```

This applies automatically to any future device that connects.

---

## 21. Alerts carry device, cause and fix

Every alert in the Alert Center now shows:

```text
severity · device name · time
message
Cause:        why this alert fired
Proposed fix: what to do about it
```

Whole-system alerts show `Entire system`; device alerts show the hostname.
The **Report** button copies the full record including cause and fix.

---

## 22. New API endpoints

```text
GET  /api/stream/stats/<device_id>        measured stream statistics
GET  /api/screenshot/<device_id>/latest   newest frame as raw JPEG
GET  /api/webcam/<device_id>/latest       newest webcam frame as raw JPEG
POST /api/remote/takeover                 announce and take control
POST /api/remote/release                  hand control back
POST /api/command/results                 command evidence history
GET  /api/security/timeline               unified security timeline
```

---

## 23. Troubleshooting

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

## 24. Eye animation

The ALL EYES X eye is used on the loading screen, login, welcome page and the
sidebar. Every animation runs through one helper:

```text
duration = base_seconds / speed
```

Default (`speed = 1`) timings:

```text
scanning valves   2.4s / 3.6s / 4.8s   (three rings, alternating direction)
crosshair valve   3.2s
scan sweep        1.8s
pupil breathing   1.3s
energy pulse      1.3s
idle wander       every 0.9s
blink             every 2.2s
outer glow        2.4s
```

The pupil also tracks the mouse with a spring that gets snappier as `speed` rises.

### Per-instance speed

`<NeuralEye speed={n} />` makes one instance more agitated without changing the
others:

```text
Login (normal)            speed 1.25
Login (security lockdown) speed 2
Padlock eye (lockdown)    speed 2.2
```

So during the security lockdown the eye visibly reads as danger, which is what
the original design intended.

---

## 25. What changed and how to activate it

Everything below is already active — this lists what it does and anything you
need to switch on.

### Bugs fixed

| Problem | Symptom you would have seen | Status |
|---|---|---|
| Terminal never got live results | typed a command, output never appeared | fixed — results now broadcast |
| Telemetry wiped on empty heartbeat | CPU/RAM/firewall dropped to 0 between refreshes | fixed — only present keys are written |
| Fresh install crashed at startup | `no such column: severity` | fixed — index moved after the migration |
| Duplicate schema | database missing what the Command Center asked for | fixed — one schema, `database_init.py` delegates to `app.py` |
| Data readable with no login | anyone on the network could enumerate the fleet | fixed — 25 routes now login-gated |
| 7 frontend calls missing credentials | pages broke once routes were protected | fixed |
| N+1 query | slow Command Center with many devices | fixed — one batched query |
| Pollers ran in hidden tabs | CPU burn while the tab was in the background | fixed — pause on `visibilitychange` |
| Tables grew forever | database file kept growing | fixed — hourly retention sweep |
| Touch Control blank screen | mirror never showed the remote screen | fixed — listened for the wrong socket event |
| Misleading empty-state hint | told you to look for a log line that never prints | fixed |

### Retention limits (automatic, hourly)

```text
alerts           5,000 rows
audit_log       10,000 rows
command_results  5,000 rows
auth_attempts    5,000 rows
remote_sessions  2,000 rows
security_scans     500 rows
notifications      200 rows   (already existed)
traffic_samples  5,000 rows   (already existed)
```

Newest rows are always kept. Change them in `RETENTION_LIMITS` in `server/app.py`.

### Environment variables

All optional — defaults work out of the box.

```powershell
# Login
$env:ADMIN_USER="admin"
$env:ADMIN_PASS="change-me"
$env:SECRET_KEY="a-long-random-string"

# Recovery phrase for the security lockdown (store the hash, not the phrase)
$env:RECOVERY_PHRASE_HASH="<sha256 hex>"

# Lockdown tuning
$env:AUTH_LOCK_THRESHOLD="5"
$env:AUTH_LOCK_WINDOW_MINUTES="15"
$env:AUTH_RECOVERY_UNLOCK_MINUTES="60"

# Agent streaming
$env:ALLEYESX_STREAM_PROFILE="low"      # low | balanced | high
$env:ALLEYESX_SCREENSHOT_INTERVAL="0.02"
$env:ALLEYESX_WEBCAM_INTERVAL="0.02"
$env:ALLEYESX_TOUCH_POLL_INTERVAL="0.5"
$env:ALLEYESX_SOFTWARE_REPORT_INTERVAL="600"
$env:ALLEYESX_FULL_FRAME_KEEPALIVE="1.0"

# Opt-in sensitive capabilities (off by default)
$env:ALLEYESX_ENABLE_PERSISTENCE="1"
$env:ALLEYESX_ENABLE_KEYLOG_DIAGNOSTIC="1"
$env:ALLEYESX_ALLOW_RAW_COMMANDS="1"

# Server
$env:AEX_AUTHORIZED_PUBLIC_SCAN_TARGETS="203.0.113.10/32"
$env:OFFLINE_NOTIFY_COOLDOWN="900"
$env:AEX_LOG_LEVEL="INFO"
```

### What is off by default and why

```text
Camera capture        off until an admin explicitly starts it
Persistence           off — set ALLEYESX_ENABLE_PERSISTENCE=1
Keylogger diagnostic  off — set ALLEYESX_ENABLE_KEYLOG_DIAGNOSTIC=1
Raw shell commands    off — set ALLEYESX_ALLOW_RAW_COMMANDS=1, then use "shell:<cmd>"
Public-range scanning blocked — allow specific ranges via AEX_AUTHORIZED_PUBLIC_SCAN_TARGETS
```

### Removed dead code

Two files were deleted after proving they were referenced nowhere in the codebase
(checked against all `.py`, `.ts`, `.tsx`, `.json`, `.md`, `.ps1` and `.txt`
files, including dynamic imports):

```text
server/dashboard_engine.py   891 lines   app.py has its own inline implementations
client/client_termux.py      149 lines   superseded by client/client.py
```

`app.py` remains the single source of truth for dashboard logic.

---

## 26. Development commands

```powershell
npm run dev
npm run build
npm run typecheck
npm test
python server\app.py
python client\client.py http://127.0.0.1:5000
```

`npm test` runs the vitest suite in jsdom. It currently covers `ResizableBox`
with real pointer events: drag deltas per handle, min/max clamping, pixel
rounding, the reset gesture, and that hidden handles do not swallow clicks.

---

## 27. GitHub branch

Updated development branch:

```text
arena/01a03556-all-eyes-x
```

Download ZIP:

```text
https://github.com/fodjofred208-design/ALL-EYES-X-/archive/refs/heads/arena/01a03556-all-eyes-x.zip
```

---

## 28. Remote access over Tailscale (HTTPS)

The dashboard is served by Caddy on **port 8080 over plain HTTP**. Nothing in the
system listens on port 443, so a bare `https://<machine>.<tailnet>.ts.net` URL has
no listener to reach — that is why it did not open from another computer or phone.

Fix it with Tailscale Serve, which terminates TLS for the magicDNS name and
forwards to Caddy. On the **server** machine:

```powershell
# once: let your user control tailscale, and enable HTTPS certs for the tailnet
tailscale set --operator=$env:USERNAME
# (also enable "HTTPS certificates" for the tailnet in the Tailscale admin console)

# publish the dashboard
tailscale serve --bg --https=443 http://127.0.0.1:8080
```

Or let the launcher do it:

```powershell
.\start_all.ps1 -Serve
```

Then `https://<machine>.<tailnet>.ts.net` works from any device on the tailnet.

To stop publishing:

```powershell
tailscale serve --https=443 off
```

### Without Tailscale Serve

Use the tailnet IP over plain HTTP, and allow the port through Windows Firewall:

```powershell
tailscale ip -4
New-NetFirewallRule -DisplayName "ALL EYES X Caddy" -Direction Inbound `
  -LocalPort 8080 -Protocol TCP -Action Allow -RemoteAddress 100.64.0.0/10
```

Then open `http://<tailscale-ip>:8080`. Prefer Tailscale Serve: it gives you TLS
instead of sending the login over plain HTTP.

### Checking it

```powershell
tailscale status            # is the machine on the tailnet?
tailscale serve status      # is 443 mapped to 8080?
curl.exe -I http://127.0.0.1:8080
```

---

## 29. Deep scan — bugs found and fixed

Found by driving the real API end to end, not by reading the code alone.

**Protocol Statistics rendered empty.** `protocol_rows` builds
`{name, percent, devices, source}`, but the response serializer read
`row['protocol']` and `row['value']` — neither key exists — so the API returned
`[{name: null, value: null}, ...]`. `ProtocolChart` plots `dataKey="name"`
against `dataKey="percent"`, so the bars were empty even though the underlying
data was correct. Verified live: ports `[22, 80, 443, 3389]` now return
SSH / HTTP / HTTPS / RDP at 25.0 % each.

**`daily_stats` was created and read but never written** — 0 rows, permanently.
`_series('score')` therefore always returned `[]`, `charts.security` was empty,
`DashboardContext` fell back to an empty threat series, and the **Threat Chart
could never render at all**. `snapshot_daily_stats()` now runs at startup and on
the existing hourly thread. Everything it writes is measured:

- `alerts` and `bandwidth` are aggregated per day from the real event tables
  (`alerts.timestamp`, `traffic_samples.ts`), which are historically accurate, so
  past days backfill exactly;
- `score` and `avg_cpu` describe the fleet at a moment in time and telemetry
  keeps no history, so they are captured only for days this server actually
  observes and left `NULL` otherwise;
- today's `score` applies the same penalties the security panel applies, so the
  chart and the panel cannot disagree.

**Unmeasured columns were landing as 0.** `daily_stats` declares `DEFAULT 0`, so
an alerts-only insert gave past days `score = 0` — indistinguishable from a real
score of 0, and the chart drew it as a measurement. The upsert now writes
explicit `NULL`s and `_series` skips them, so a day nobody watched is absent from
the chart instead of being drawn as a fabricated zero.

**Two history queries returned the oldest window.** `_series` used
`ORDER BY date ASC LIMIT 30` and `alert_trend` used `ORDER BY d ASC LIMIT 120`,
so once history passed the limit the charts froze on the oldest days and never
updated again. Both now order `DESC` and reverse. Verified with 284
(day, severity) groups: `alert_trend` returns `2026-02-11 … 2026-07-12` and no
longer starts at `2026-01-01`.

**Touch Monitor polled `/api/screenshot` every 100 ms with no in-flight guard** —
the only frame poller without one — so slow responses stacked. It now uses the
same guard Live Monitor and Webcam already had.

**No frame poller paused in a hidden tab.** A backgrounded mirror kept pulling
full screenshots at up to 30/s for nobody. All three now go through the existing
`usePolling` hook.

**Four `fetch` calls omitted `credentials: 'include'`** (`/api/touch` and webcam
start/stop/switch). Harmless same-origin, but `api.ts` documents a cross-origin
`VITE_API_BASE` mode where all four would 401 against `@login_required` routes.
A full re-scan now reports zero `fetch` calls without credentials.

**Removed three unreachable "More Feature" panels** (Live Monitor, Webcam, Touch
Monitor). `setShowMoreFeature` had no call site anywhere in `src/`, so they could
never render, and their `watched` / `toggleWatched` state was used only inside
them. `noUnusedLocals` is off in `tsconfig.json`, which is why the unused setter
was never flagged. The reachable Multi-\* pages are `/device-wall` and
`/multi-shell`.

### Checked and found correct

- All 15 unauthenticated routes: the auth routes, the four agent routes
  `client.py` actually calls, touch poll/ack, and static files.
- Socket event names match in both directions — every `socket.on` in the frontend
  has a `socketio.emit` on the backend.
- All four queued task types (`command`, `notify_user`, `nmap_scan`,
  `webcam_command`) are handled by the agent.
- Command queue → heartbeat delivery → result POST → frontend poll works end to
  end, and Multi-Shell's completion predicate is satisfied.
- No-frame and unknown-device paths return clean 404 JSON, not a stack trace.
- Fresh-database startup completes with 25 tables and no crash.
