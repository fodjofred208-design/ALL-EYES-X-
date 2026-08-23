# ALL EYES X — Neural Cyber Intelligence Platform
## Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Technology Stack](#4-technology-stack)
5. [Installation & Setup](#5-installation--setup)
6. [Server — app.py](#6-server--apppy)
7. [Client Agent — client.py](#7-client-agent--clientpy)
8. [Frontend — React Dashboard](#8-frontend--react-dashboard)
9. [Authentication](#9-authentication)
10. [Pages & Features](#10-pages--features)
11. [Global State Management](#11-global-state-management)
12. [API Endpoints](#12-api-endpoints)
13. [Real-Time Communication](#13-real-time-communication)
14. [Visual Design System](#14-visual-design-system)
15. [Mobile & PWA Support](#15-mobile--pwa-support)
16. [Deployment with Ngrok](#16-deployment-with-ngrok)
17. [Troubleshooting](#17-troubleshooting)
18. [Security Considerations](#18-security-considerations)

---

## 1. Project Overview

**ALL EYES X** is a full-stack cyber-security monitoring and remote administration platform. It consists of three main components:

- **Flask Server** (`server/app.py`) — Command & Control backend with REST API + WebSocket support
- **Client Agent** (`client/client.py`) — Cross-platform Python agent that runs on target machines
- **React Dashboard** — Cyberpunk-themed web interface for monitoring and controlling connected devices

### Core Capabilities
- Remote device registration and real-time heartbeat monitoring
- Live screen streaming (AnyDesk-style adaptive FPS)
- Remote terminal command execution with 30+ built-in vectors
- Webcam surveillance with silent frame capture
- Touch-screen manipulation for mobile and desktop devices
- P2P encrypted file sharing (up to 2GB)
- Threat scanning and security neutralization
- Geolocation tracking with city/country/coordinates
- Persistent agent installation (survives reboots)
- Real-time notification system for all system events

---

## 2. Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│   client.py     │────────▶│    server/app.py     │◀────────│  React Dashboard │
│  (any device)   │  :5000  │  (Flask + SocketIO)  │  :5000  │   (Vite :5173)   │
│                 │  HTTP   │                      │  HTTP   │                  │
│ • Register      │         │ • /api/register      │         │ • Polls /api/*   │
│ • Heartbeat     │         │ • /api/heartbeat     │         │ • Target selector│
│ • Screenshots   │         │ • /api/screenshot    │         │ • Live charts    │
│ • Webcam frames │         │ • /api/webcam        │         │ • Notifications  │
│ • Command exec  │         │ • /api/command       │         │ • Terminal UI    │
│ • Keylogger     │         │ • /api/notifications │         │                  │
│ • Persistence   │         │ • /api/analytics     │         │                  │
│ • Geo-location  │         │ • /api/transfer/*    │         │                  │
└─────────────────┘         └──────────────────────┘         └──────────────────┘
```

### Data Flow
1. `client.py` sends `POST /api/register` with full system info (CPU, RAM, OS, IP, MAC, geo)
2. Server stores device and creates a notification
3. `client.py` sends `POST /api/heartbeat` every 5 seconds — server returns pending tasks
4. Dashboard polls `GET /api/devices` every 3 seconds to update device list
5. Dashboard polls `GET /api/notifications` every 3 seconds for the notification feed
6. Commands are queued via `POST /api/command` and delivered on next heartbeat

---

## 3. Directory Structure

```
ALL_EYES_X/
├── server/
│   ├── app.py                              # ✏️ 2 edits (build_devices_payload + /api/dashboard)
│   ├── dashboard_engine.py                 # ✏️ optional (same builder function)
│   ├── aeyes_data.db                       # auto-migrates, no touch
│   └── ...
│
├── client/
│   ├── client.py                           # ✏️ 2 edits (get_device_payload + register)
│   └── requirements.txt
│
├── src/
│   ├── index.css                           # ✏️ APPEND v4.3 at end
│   │
│   ├── main.tsx                            # untouched
│   ├── App.tsx                             # ✏️ 2 edits (add 2 imports + 2 routes)
│   │
│   ├── utils/
│   │   ├── api.ts                          # untouched
│   │   ├── format.ts                       # untouched
│   │   └── normalize.ts                    # 🆕 CREATE
│   │
│   ├── context/
│   │   ├── DashboardContext.tsx            # untouched
│   │   ├── DeviceContext.tsx               # untouched
│   │   ├── SocketContext.tsx               # untouched
│   │   └── WelcomeContext.tsx              # untouched
│   │
│   ├── hooks/
│   │   ├── useReducedMotion.ts             # untouched
│   │   ├── useInView.ts                    # untouched
│   │   └── useAlertSound.ts                # untouched
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx                   # ✏️ REPLACE ALL (new hierarchy)
│   │   ├── AlertCenter.tsx                 # 🆕 CREATE
│   │   ├── ChartAnalysis.tsx               # 🆕 CREATE
│   │   ├── Analytics.tsx                   # untouched
│   │   ├── Device.tsx                      # untouched
│   │   ├── DeviceDetail.tsx                # untouched
│   │   ├── Terminal.tsx                    # untouched
│   │   ├── Webcam.tsx                      # untouched
│   │   ├── LiveMonitor.tsx                 # untouched
│   │   ├── TouchMonitor.tsx                # untouched
│   │   ├── P2PShare.tsx                    # untouched
│   │   ├── Security.tsx                    # untouched
│   │   └── Login.tsx                       # untouched
│   │
│   └── components/
│       ├── NeuralEye.tsx                   # untouched
│       ├── ConstellationBackground.tsx     # untouched
│       ├── NotificationCenter.tsx          # untouched
│       ├── Layout.tsx                      # untouched
│       │
│       ├── welcome/
│       │   └── WelcomeExperience.tsx       # untouched
│       │
│       ├── effects/
│       │   ├── AmbientBackground.tsx       # untouched
│       │   ├── GlowCard.tsx               # untouched
│       │   ├── AnimatedNumber.tsx         # untouched
│       │   ├── RadialGauge.tsx            # untouched
│       │   └── Skeleton.tsx               # untouched
│       │
│       └── dashboard/
│           ├── DashboardCard.tsx           # ✏️ REPLACE ALL (onClick + variant)
│           ├── KpiCard.tsx                 # 🆕 CREATE
│           ├── KpiStrip.tsx                # ✏️ REPLACE ALL
│           ├── ExecutiveCard.tsx           # untouched
│           ├── StatCard.tsx                # untouched
│           ├── SecurityScore.tsx           # untouched
│           ├── ThreatLevel.tsx             # untouched
│           ├── DevicesOverview.tsx         # ✏️ 3 edits (import normalizer + use it)
│           ├── GlobalTopologyMap.tsx       # ✏️ 2 edits (normalize list)
│           ├── CriticalChartAnalysis.tsx   # ✏️ REPLACE ALL
│           ├── DevicesStatsPanel.tsx       # ✏️ REPLACE ALL
│           ├── TrafficAnalysisPanel.tsx    # ✏️ REPLACE ALL
│           ├── SecurityActivityStrip.tsx   # untouched (created earlier)
│           ├── TrafficMonitor.tsx          # untouched
│           ├── LiveStats.tsx               # untouched
│           ├── DeviceRiskTable.tsx         # untouched
│           ├── AlertPanel.tsx              # untouched
│           ├── AuthenticationPanel.tsx     # untouched
│           ├── ActivityTimeline.tsx        # untouched
│           ├── SystemHealth.tsx            # untouched
│           ├── PerformanceCharts.tsx       # untouched
│           ├── MiniWorldMap.tsx            # untouched
│           ├── QuickActions.tsx            # untouched
│           └── FooterSummary.tsx           # 🆕 CREATE (if missing)
│           └── charts/
│               ├── TrafficChart.tsx        # untouched
│               ├── CPUChart.tsx            # untouched
│               ├── ThreatChart.tsx         # untouched
│               └── ProtocolChart.tsx       # untouched
│
├── package.json                           # untouched
└── node_modules/                          # don't touch

---

## 4. Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend Framework | React 18 + TypeScript | 18.x |
| Build Tool | Vite | 7.x |
| CSS Framework | Tailwind CSS | 4.x |
| Animation | Framer Motion | 11.x |
| Charts | Recharts | 2.x |
| Icons | Lucide React | Latest |
| Routing | React Router DOM | 6.x |
| Backend | Python Flask | 2.x |
| Real-time | Flask-SocketIO | 5.x |
| CORS | Flask-CORS | 4.x |
| Client Agent | Python 3 stdlib | 3.6+ |

### Optional Python Packages (client.py)
- `psutil` — Better system info
- `Pillow` / `mss` / `pyautogui` — Screenshot capture
- `opencv-python` — Webcam capture
- `pynput` — Keylogger

---

## 5. Installation & Setup

### Prerequisites
- Node.js 18+
- Python 3.6+
- pip

### Step 1: Install Frontend Dependencies
```bash
npm install
```

### Step 2: Install Server Dependencies
```bash
pip install flask flask-socketio flask-cors
```

### Step 3: Start the Server
```bash
cd server
python app.py
```
Output:
```
╔══════════════════════════════════════════════╗
║     ALL EYES X — Neural Cyber Intelligence   ║
║        Server starting on port 5000...        ║
║     Dashboard: http://192.168.56.1:5173         ║
║     Login:     admin / FRED123               ║
╚══════════════════════════════════════════════╝
```

### Step 4: Start the Dashboard
```bash
npm run dev
```
Opens at `http://localhost:5173`

### Step 5: Run the Client (on any machine)
```bash
python client/client.py
```
Or with custom server: `python client.py http://YOUR_SERVER_IP:5000`

---

## 6. Server — app.py

### Configuration
```python
SECRET_KEY = 'aeyes_x_s3cr3t_k3y_2026'
ADMIN_USER = 'admin'
ADMIN_PASS = 'FRED123'
MAX_CONTENT_LENGTH = 2 * 1024 * 1024 * 1024  # 2GB file limit
```

### Data Stores (in-memory)
| Variable | Type | Purpose |
|----------|------|---------|
| `connected_devices` | dict | device_id → device info |
| `connected_clients_sid` | dict | device_id → WebSocket session ID |
| `webcam_frames` | dict | device_id → latest base64 frame |
| `screenshare_frames` | dict | device_id → latest base64 screenshot |
| `pending_tasks` | dict | device_id → list of queued commands |
| `device_alerts` | dict | device_id → list of alerts |
| `notifications` | list | Global notification feed |

### Background Threads
- **Cleanup thread** — Runs every 15 seconds, marks devices offline if no heartbeat for 30s
- Adds offline notifications automatically

### Auth System
- Session-based using Flask `session`
- `@login_required` decorator protects page routes
- API routes `/api/register`, `/api/heartbeat`, `/api/dashboard`, `/api/devices`, `/api/analytics`, `/api/notifications` have **NO AUTH** (required for client.py and dashboard polling)
- Other API routes are behind auth

---

## 7. Client Agent — client.py

### Cross-Platform Support
- **Windows** — Registry Run key + Scheduled Task for persistence, PowerShell screenshots, `getmac` for MAC
- **Linux** — systemd user service + crontab + autostart .desktop, `/proc/cpuinfo` for CPU, `/sys/class/net/` for MAC
- **macOS** — LaunchAgent plist for persistence, `sysctl` for CPU/RAM, `ifconfig` for MAC
- **Android/iOS** — Graceful fallback with uuid.getnode() for MAC

### Hardware ID Generation
```python
DEVICE_ID = sha256(f"{mac}-{disk_serial}-{hostname}").hexdigest()[:16]
```
- Uses 6 fallback methods for MAC address (uuid.getnode, psutil, /sys/class/net, ip link, ifconfig, getmac)
- Disk serial via wmic (Windows), /sys/block (Linux), system_profiler (macOS)

### System Info Collected
- hostname, OS, OS version, CPU model, RAM total, architecture
- Local IP, public IP (4 fallback services)
- Geolocation (ip-api.com, ipapi.co) — country, city, latitude, longitude

### Screenshot Capture (6 methods)
1. **MSS** — Fastest cross-platform
2. **Pillow ImageGrab** — Most common
3. **PyAutoGUI** — Slow but reliable
4. **ImageMagick import** — Linux subprocess
5. **scrot** — Linux fallback
6. **PowerShell** — Windows native (System.Drawing)

### Webcam Capture
- OpenCV (`cv2.VideoCapture(0)`) — Primary
- fswebcam — Linux fallback

### Persistence
| OS | Method 1 | Method 2 | Method 3 |
|----|----------|----------|----------|
| Windows | Registry Run key | Scheduled Task (schtasks) | — |
| Linux | systemd user service | crontab @reboot | .desktop autostart |
| macOS | LaunchAgent plist | — | — |

### Connection Logic
- On startup: `register()` retries forever with backoff (5s → 10s → ... → 60s max)
- Main loop: heartbeat + screenshot + webcam every interval
- If heartbeat fails: prints error, re-registers on next cycle
- Console hides on Windows via `ctypes.windll.user32.ShowWindow`

### Keylogger (optional)
- Requires `pynput` package
- Runs in daemon thread
- Gracefully fails if not installed

---

## 8. Frontend — React Dashboard

### Entry Flow
```
Loading Screen (neural eye + constellation + progress bar)
    ↓ morph transition (blur + scale)
Login Page (constellation + eye + credentials)
    ↓ morph transition (blur + scale)
Dashboard (3 aurora waves + scanline + all panels)
```

### API Auto-Detection (`src/utils/api.ts`)
```typescript
const getApiBase = () => {
  const custom = localStorage.getItem('ALLEYESX_SERVER');
  if (custom) return custom;
  return `http://${window.location.hostname}:5000`;
};
```
- If dashboard is at `http://192.168.1.50:5173`, it auto-connects to `http://192.168.1.50:5000`
- Override with `localStorage.setItem('ALLEYESX_SERVER', 'http://ngrok-url')`

### Global State (`DeviceContext.tsx`)
- Polls `GET /api/devices` every 3 seconds
- Provides `devices[]`, `selectedDevice`, `setSelectedDeviceId()`
- No mock data — devices only appear when client.py connects

### Panel Wrapper (`App.tsx`)
- Each route is wrapped in a `<Panel>` component
- Animates in with opacity + translateY + scale
- Adds `.panel-shine` effect (green light sweep on mount)
- Aurora waves are always visible behind all panels

---

## 9. Authentication

### Login Credentials
- **Username**: `admin`
- **Password**: `FRED123`

### Login Page Features
- Constellation background with mouse-reactive particle lines
- Animated neural eye with 3 rotating iris valves
- Eye-toggle for password visibility
- Full-page horizontal scan line
- Matches server's `ADMIN_USER` / `ADMIN_PASS` environment variables

---

## 10. Pages & Features

### Dashboard (`/`)
- 6 stat cards (nodes, traffic, speed, threats, alerts, link quality)
- Area chart (neural load + traffic over time)
- Connection feed (lists connected devices)
- Server uplink indicator
- Real-time device count from server

### Analytics (`/analytics`)
- OS distribution pie chart
- RAM bucket bar chart
- CPU model distribution
- 24-hour activity timeline
- Shows "Waiting for devices..." overlay until data exists

### Devices (`/devices`)
- Full table: status, identity, IP/MAC, hardware, location, last seen
- "Waiting for connection..." state when no devices
- Device type icons (desktop/laptop/mobile/server)
- All data comes from `GET /api/devices`

### Live Monitor (`/live_monitor`)
- AnyDesk-style adaptive FPS display
- Latency and bandwidth indicators
- 3 states: No device selected → Device selected (standby) → Live stream
- "Initiate Tunnel" button (disabled until device selected)
- Side panel with session info and stream engine status

### Terminal (`/terminal`)
- 30+ built-in command vectors:
  - `help`, `sysinfo`, `netstat`, `ps`, `screenshot`, `keylog_start`, `keylog_dump`
  - `pwr_on`, `pwr_off`, `reboot`, `lock`, `inject`, `bypass_av`, `root_esc`
  - `net_scan`, `sql_audit`, `wifi_crack`, `ddos_node`, `cam_snap`, `mic_listen`
  - `scr_grab`, `usr_logs`, `clear`
- Command result sent to `POST /api/command/result`
- Quick-access buttons for common commands

### Webcam (`/webcam`)
- Live webcam feed display
- Record and snapshot buttons (trigger notifications)
- ISO gain and neural depth controls
- Stealth optics info panel

### Touch Monitor (`/touch_monitor`)
- Phone mode and Desktop mode toggle
- Phone frame with app grid mockup
- Desktop frame with monitor mockup
- Vector controls (click, type, reset, kill)
- Neural latency indicator

### P2P Share (`/p2p_share`)
- Upload interface (up to 2GB via `POST /api/transfer/upload`)
- Download via `GET /api/transfer/download/{id}/{filename}`
- Transfer history list
- Node selection grid

### Security (`/security`)
- Threat scan button (3-stage: scan → detect → eliminate)
- Attack surface analysis chart
- Node integrity bars (Neural Core, Stealth Level, AV Evasion)
- Emergency disconnect button

---

## 11. Global State Management

### DeviceContext
```
DeviceProvider (wraps entire app)
  ├── devices: Device[]          (from GET /api/devices, polled every 3s)
  ├── selectedDevice: Device     (set by DeviceSelector)
  ├── setSelectedDeviceId(id)    (used by all panels)
  ├── isLoading: boolean
  └── refresh()                  (manual refetch)
```

### DeviceSelector Component
- Appears in top bar (desktop) and sidebar
- Dropdown of all connected devices
- Selected device drives Live Monitor, Webcam, Terminal, etc.

---

## 12. API Endpoints

### No Auth Required (client.py + dashboard polling)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/register` | Client registration (all system info) |
| POST | `/api/heartbeat` | Client heartbeat + receive tasks |
| GET | `/api/dashboard` | Dashboard overview data |
| GET | `/api/devices` | All devices list |
| GET | `/api/analytics` | Chart data |
| GET | `/api/notifications` | Notification feed |
| POST | `/api/notify` | Add notification |
| GET | `/api/device/<id>` | Single device details |
| GET | `/api/geolocation` | Device coordinates |
| GET/POST | `/api/screenshot/<id>` | Screenshot upload/retrieve |
| GET/POST | `/api/webcam/<id>` | Webcam frame upload/retrieve |
| POST | `/api/command/result` | Command execution result |
| GET/POST | `/api/alerts/<id>` | Device alerts |
| GET | `/api/system/stats` | Server CPU/RAM/disk stats |

### Auth Required
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET/POST | `/login` | Authentication |
| GET | `/logout` | Clear session |
| GET | `/dashboard`, `/analytics`, etc. | Page routes |
| POST | `/api/command` | Queue command for device |
| POST | `/api/transfer/upload` | File upload (2GB) |
| GET | `/api/transfer/download/<id>/<name>` | File download |
| GET | `/api/transfer/list` | List transfers |

---

## 13. Real-Time Communication

### HTTP Polling (primary)
- Dashboard → `GET /api/devices` (every 3s)
- Dashboard → `GET /api/notifications` (every 3s)
- Client → `POST /api/heartbeat` (every 5s)

### WebSocket (SocketIO — secondary)
- Events: `connect`, `disconnect`, `register_device`, `client_heartbeat`, `command_result`
- Broadcasts: `screenshare_frame`, `webcam_frame`, `new_alert`, `file_transfer`
- Falls back to HTTP polling if WebSocket unavailable

---

## 14. Visual Design System

### Colors
| Element | Hex |
|---------|-----|
| Background | `#060812` |
| Card Background | `rgba(10,14,26,0.75)` |
| Primary Accent | `#22c55e` (neon green) |
| Secondary Accent | `#00d4ff` (neon cyan) |
| Tertiary Accent | `#8b5cf6` (neon purple) |
| Text Primary | `#e2e8f0` |
| Text Muted | `#64748b` |
| Success | `#22c55e` |
| Error | `#ef4444` |
| Warning | `#eab308` |

### Fonts
| Usage | Font |
|-------|------|
| Headings | Orbitron |
| Body | Rajdhani |
| Code/Data | Share Tech Mono |
| UI | Inter |

### Effects
- **Aurora waves**: 3 rotating radial gradients (green/cyan/purple), `filter: blur(100px)`, 35-60s rotation
- **Scan line**: 2px green line sweeping vertically every 5s
- **Glass cards**: `backdrop-filter: blur(20px)`, semi-transparent background
- **Panel shine**: Green gradient light sweeps across panels on mount
- **Constellation**: Canvas particles with mouse-reactive connecting lines
- **Neural eye**: 3 rotating iris valves, mouse tracking, periodic blinking
- **Custom scrollbar**: Hidden by default, green on hover

### Animations
- Page transitions: morph with blur + scale (0.9s cubic-bezier)
- Panel enter: opacity + translateY + scale (0.5s)
- Stat cards: hover scale + translateY
- Notification bounce on new events

---

## 15. Mobile & PWA Support

### Responsive Design
- All pages fully responsive with `md:` and `lg:` breakpoints
- Sidebar overlays full screen on mobile, closes on outside click
- Top bar adapts — hides some elements on small screens
- Tables scroll horizontally
- Touch-friendly button sizes

### Access from Phone
1. Find your computer's local IP (e.g., `192.168.1.50`)
2. On phone browser: `http://192.168.1.50:5173`
3. Dashboard auto-connects to `http://192.168.1.50:5000`
4. Login: `admin` / `FRED123`

### Vite Configuration
```typescript
server: {
  host: true,        // Allows LAN access
  allowedHosts: true  // Allows ngrok tunnels
}
```

---

## 16. Deployment with Ngrok

### Expose Dashboard Globally
```bash
ngrok http 5173
```
Use the ngrok URL on any device worldwide.

### Expose Server for Remote Clients
```bash
ngrok http 5000
```
Update `client.py`:
```python
SERVER_URL = "https://abc123.ngrok-free.app"
```

### Dynamic API Detection
The dashboard auto-detects the server based on hostname:
- If dashboard URL is `https://abc.ngrok.io`, it calls `https://abc.ngrok.io:5000/api/...`
- Override with: `localStorage.setItem('ALLEYESX_SERVER', 'https://your-api.ngrok.io')`

---

## 17. Troubleshooting

### Client won't connect
- **Error**: `Connection failed: [WinError 10061]`
- **Fix**: Start `server/app.py` first. Client retries automatically.
- **Check**: `SERVER_URL` in `client.py` matches server IP/port

### Dashboard shows no devices
- **Cause**: No client has connected yet
- **Expected**: Shows "Waiting for connection..." until `client.py` registers

### Dashboard can't reach server
- **Check**: Server is running on port 5000
- **Check**: Firewall allows port 5000
- **Check**: `API_BASE` in browser console → `localStorage.getItem('ALLEYESX_SERVER')`

### 401 Unauthorized on /api/dashboard
- **Fixed**: This endpoint has no auth in current `app.py`
- If it still occurs, restart the Flask server

---

## 18. Security Considerations

### Server
- Session-based auth with secret key
- CORS enabled for cross-origin dashboard requests
- File upload limit: 2GB
- Auth-protected page routes and command endpoints
- No auth on client-facing endpoints (required for agent communication)

### Client Agent
- SSL verification disabled (for self-signed certs)
- Console window hidden on Windows
- Installs persistence silently
- Operates as background daemon thread
- Graceful degradation on all platforms

### Dashboard
- No credentials stored in frontend code
- Session-based authentication
- API base URL configurable per deployment

---

*ALL EYES X — Department of Black Cortex Universal Control — v1.0*
