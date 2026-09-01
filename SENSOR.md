# ALL EYES X — SENSOR INSTALLATION GUIDE

Several Analysis modules show **"SENSOR NOT INSTALLED"** because the data they need
is not collected yet. This document explains, for each one, exactly what to
install, on which machine, and what unlocks afterwards.

The authoritative list lives in code at
`src/components/analysis/capabilities.ts` — if a module's status changes there,
this document should be updated with it.

---

## How sensors work in ALL EYES X

```
MONITORED DEVICE  →  ALL EYES X AGENT (client.py)  →  BACKEND  →  ANALYSIS UI
```

Almost every sensor is installed **on the monitored device**, not the server,
because the agent is what reads the machine. The server only stores what agents
send it.

Two kinds of install:

| Type | Where | What it enables |
|---|---|---|
| **Python packages** | the machine running `client.py` | telemetry the agent can already collect once the library is present |
| **System tools** | the machine running `client.py` | OS-level data (packets, logs, firewall config) |

Nothing here is optional-decoration: if a package is missing, the agent reports
`NOT REPORTED` rather than guessing.

---

## 1. Core agent packages (already documented, listed for completeness)

Install on every monitored machine:

```bash
pip install psutil pillow requests
```

| Package | Enables | Missing means |
|---|---|---|
| `psutil` | CPU, RAM, disk, processes, network counters | `telemetry: false`, CPU shows 0 |
| `pillow` | screenshot encoding | no screenshots |
| `requests` | — (unused, kept for compatibility) | nothing |

The agent prints exactly what it is missing on startup:

```
[*] Capabilities: telemetry=True hardware=True screenshot=False webcam=False input=False nmap=True
[*] Limited mode: install to enable: opencv-python (webcam), pyautogui pynput (remote input)
```

**Read that line.** It is the authoritative per-machine answer.

---

## 2. Sensors that only need a package

### Webcam — `opencv-python`

```bash
pip install opencv-python
```

Unlocks: **Webcam** panel and the Multi-Cam wall.
Note: the webcam is **opt-in**. It stays off until an administrator explicitly
starts it from the Webcam page; the agent logs the action.

### Remote input — `pyautogui` + `pynput`

```bash
pip install pyautogui pynput
```

Unlocks: **Touch Control** / remote input.
Note: also opt-in and audited. Remote control sessions are recorded in
`remote_sessions` and the person at the machine is notified.

### Screenshots (desktop) — `mss` + `numpy`

```bash
pip install mss numpy
```

Unlocks: Live Monitor and Multi-Monitor. `numpy` enables dirty-rectangle
diffing, which sends only the changed region instead of whole frames — without it
the agent still streams, but uses far more bandwidth.

---

## 3. Nmap — system tool, not a Python package

Nmap is a **system** tool. Install it on the machine whose agent will run the
scan, because scans are executed by the agent, not the server.

**Windows**
```powershell
winget install Insecure.Nmap
# or download from https://nmap.org/download.html and add it to PATH
nmap --version
```

**Debian / Ubuntu**
```bash
sudo apt update && sudo apt install -y nmap
nmap --version
```

**RHEL / Fedora**
```bash
sudo dnf install -y nmap
```

**macOS**
```bash
brew install nmap
```

**Termux (Android)**
```bash
pkg install nmap
```

Unlocks: **Analysis → Port Analysis → Nmap Vulnerability Scanner**.

> Scans are authorized network-analysis operations launched explicitly by an
> operator, limited to private/Tailscale targets, stored in `security_scans` and
> audited. An nmap result is a **scan finding**, never a confirmed vulnerability.

---

## 4. Sensors that need NEW agent code

These cannot be enabled by installing something today. The agent does not
collect the data yet, so the module stays `deferred` until the collector ships.
Each entry states what would have to be built.

### 4.1 Live Packet Analysis — **no packet sensor exists**

Nothing in ALL EYES X captures packets. The agent opens no capture socket and the
backend stores none.

To build it, the agent would need one of:

```bash
# Linux — requires libpcap and root or CAP_NET_RAW
sudo apt install -y libpcap-dev tcpdump
pip install pyshark scapy

# Windows — Npcap must be installed in WinPcap-compatible mode
# https://npcap.com/
pip install pyshark scapy
```

Then a new collector that streams decoded packets to a new backend table.
**Until that exists the panel must keep showing `SENSOR NOT INSTALLED`** — it must
never display invented packets, protocols, bandwidth or packet counts.

### 4.2 Log Analyzer / Sigma / Anomaly Detection — **no log collector**

The agent has `wevtutil` and `journalctl` commands in its Terminal command set,
but nothing collects or stores log events, and there is no log table.

To build it:

```bash
# Windows — built in, no install needed
wevtutil qe Security /c:50 /rd:true /f:text

# Linux — built in
journalctl -n 50 --no-pager
sudo apt install -y rsyslog        # if syslog forwarding is wanted
```

Then a collector that ships events to the backend. **Sigma detection depends on
this** — Sigma rules match stored log events, so it cannot exist first.
**Anomaly detection depends on it too**, plus a baseline period.

### 4.3 IOC Detection — **no threat-intelligence feed**

There is no VirusTotal / OTX / MISP integration and no local indicator store, and
no file hashes are collected.

To build it you would need an API key and a collector:

```bash
pip install vt-py                # VirusTotal
# or OTX: https://otx.alienvault.com/api  (free account)
```

Until then, nothing is matched and **no threat-intel result is fabricated**.

### 4.4 AI Security Advisor / AI Anomaly Detection — **no model**

There is no LLM anywhere in the stack. Rendering generated recommendations would
present inference as telemetry, which this system does not do.

To build it you would need a model endpoint (local or hosted) and a strict
separation in the UI between **observed facts** and **AI inference**.

### 4.5 Threat Heat Map — **no attack-origin telemetry**

Devices carry latitude/longitude resolved from their own IP, but there are no
external connection events, so there are no attack origins to plot. Drawing arcs
would mean inventing them.

Needs: the packet/connection sensor from 4.1.

### 4.6 Topology links (ethernet / Wi-Fi between devices) — **no layer-2 discovery**

The topology map can show monitored devices, but routers, switches, the internet
gateway and the links *between* hosts are not discovered. There is no ARP,
routing-table or LLDP collection.

To build it the agent would collect:

```bash
# Linux
ip neigh                     # ARP neighbours
ip route                     # routing table / gateway
cat /proc/net/arp

# Windows
arp -a
route print
netsh wlan show interfaces   # wireless link
```

Until then links are **not drawn**, because an undrawn link is honest and an
invented one is not.

---

## 5. Phone / Android (Termux) sensors

Termux needs both a package **and** an app.

```bash
pkg install python termux-api nmap
pip install psutil pillow requests
```

Then install the **Termux:API app** from F-Droid — the package alone is not
enough.

| Sensor | Requires | Missing means |
|---|---|---|
| Wi-Fi info | Termux:API app | Wi-Fi shows NOT REPORTED |
| Battery | Termux:API app | battery shows NOT REPORTED |
| Screenshot | Termux:API app | `screenshot: false` |
| Notice to user | Termux:API app | the administrator message cannot be shown |
| Device model | Termux:API app or `/system/build.prop` | falls back to `localhost` |

There is no display server a Python process can grab on Android, so screenshots
are whole frames via `termux-screenshot`; dirty-rectangle diffing is unavailable.

---

## 6. Checking what is actually installed

On the monitored machine:

```bash
python -c "import psutil, PIL; print('core ok')"
python -c "import mss, numpy; print('screenshots ok')"
python -c "import cv2; print('webcam ok')"
python -c "import pyautogui, pynput; print('input ok')"
nmap --version
```

On the server, the Analysis page shows the live status per module, and the
Devices Analysis endpoint reports per-device what was actually received:

```
GET /api/analysis/endpoints
```

Each device entry includes `has_telemetry`, `open_ports`, `usb_devices`,
`suspicious_processes` and `firewall` — where `firewall: -1` means *never
reported*, which is deliberately different from `0` (reported as disabled).

---

## 7. Summary

| Module | Install to enable | Where |
|---|---|---|
| Webcam | `pip install opencv-python` | agent machine |
| Remote input | `pip install pyautogui pynput` | agent machine |
| Screenshots (desktop) | `pip install mss numpy` | agent machine |
| Nmap scanner | system `nmap` | agent machine |
| USB / firewall / process detail | **new agent collector** | — |
| Packet analysis | `libpcap` + `pyshark`/`scapy` **and new collector** | — |
| Log analyzer | `wevtutil`/`journalctl` **and new collector** | — |
| Sigma detection | log collector first | — |
| IOC detection | threat-intel API + collector | — |
| AI advisor / anomaly | model endpoint | — |
| Threat heat map | packet/connection sensor | — |
| Topology links | ARP / route / LLDP collector | — |

**Rule that governs all of this:** a module with no sensor shows
`SENSOR NOT INSTALLED` and explains what is missing. It never shows zeros,
sample rows or invented statistics to look populated.
