# ALL EYES X — How Every Component Works

A detailed explanation of what each part of the system does, how the pieces
connect, and where the data comes from. Everything here describes code that
exists in this repository and has been verified against a running server.

---

## 1. System architecture

```
┌─────────────────────┐
│  MONITORED MACHINE  │
│  client.py (agent)  │
└──────────┬──────────┘
           │  HTTP, outbound only, keep-alive
           ▼
┌─────────────────────┐        ┌──────────────────┐
│  Flask + Socket.IO  │◄──────►│  SQLite database │
│  server/app.py      │        │  aeyes_data.db   │
│  :5000              │        └──────────────────┘
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │  Caddy    │  :8080  reverse proxy
     └─────┬─────┘
           │
┌──────────▼──────────┐
│  React SPA          │
│  src/  (Vite :5173) │
└─────────────────────┘
```

**The agent only ever makes outbound connections.** No inbound port is opened on a
monitored machine. Everything the agent does — registering, heartbeats, uploading
screenshots, reporting telemetry, collecting logs and connections — is an outbound
HTTP request it initiates. This is why the agent works behind NAT and firewalls
without configuration.

**The server holds no long-lived connection to any agent.** Commands are queued and
the agent collects them on its next heartbeat. This is a deliberate pull model: a
machine that goes offline simply stops collecting, and reconnects on its own.

---

## 2. The two-channel design

Every HTTP request the agent makes goes through one of two keep-alive connections.

| Channel | Used for | Timeout | Retries |
|---|---|---|---|
| **control** | register, heartbeat, command results | 10s | 1 retry |
| **bulk** | screenshots, webcam frames | 4s | no retry |

This separation matters. A screenshot is a large upload; if it shared a connection
with the heartbeat, a slow upload could delay the heartbeat past the server's 30
second offline threshold and the device would flap offline. Keeping them apart
means a slow frame upload can never make a device look offline.

Heartbeats also carry the agent's identity (`os`, `os_version`, `hostname`), so a
device row created by an older agent that reported no OS heals to the real OS
label while the agent runs, without waiting for a re-register. And because
`connected_devices` is a per-process cache, every reader first consults the
shared database: a `last_seen` fresher than 45s with `status='online'` in the
table proves some worker is hearing from that agent, so a worker that receives
no heartbeats (a WSGI pool behind Caddy, the debug reloader's parent) adopts
`online` instead of showing a live machine as offline. The offline reaper makes
the same check before it ever stamps `offline`, so two processes can no longer
fight over a device's status.

A stale frame is worthless by the time a retry would land, so the bulk channel does
not retry at all.

---

## 3. The agent: what it collects and how often

Every interval is tunable by environment variable, so a slow machine can be
throttled without editing code.

| Collector | Interval | Env var | What it reads |
|---|---|---|---|
| Heartbeat | 5s | `HEARTBEAT_INTERVAL` | liveness, OS identity (os/os_version/hostname), cpu, ram, disk, ports, firewall, antivirus, malware, processes |
| Screenshot | 1/49.5s | `ALLEYESX_SCREENSHOT_INTERVAL` | display capture, dirty-rectangle diffed |
| Webcam | 1/49.5s | `ALLEYESX_WEBCAM_INTERVAL` | camera frame, opt-in only |
| Touch poll | 0.5s | `ALLEYESX_TOUCH_POLL_INTERVAL` | inbound control events |
| **Network flows** | 15s | `ALLEYESX_FLOW_INTERVAL` | kernel connection table |
| **Link neighbours** | 60s | `ALLEYESX_LINK_INTERVAL` | ARP table + routing table |
| **Log events** | 60s | `ALLEYESX_LOG_INTERVAL` | journalctl / Get-WinEvent / log show |
| Hardware inventory | 60s | — | BIOS, board, CPU, memory, storage, NICs, peripherals |
| Software inventory | 600s | `ALLEYESX_SOFTWARE_REPORT_INTERVAL` | installed apps, user files |

Stream quality is set by `ALLEYESX_STREAM_PROFILE`: `low` (35 FPS), `balanced`
(50 FPS, the default) or `high` (60 FPS).

### Screenshot dirty-rectangle diffing

The agent does not send a whole frame every time. It compares the new capture to
the previous one, and if the changed area is under `MAX_DIRTY_PERCENT` of the
screen it sends only that rectangle with its coordinates. The server forwards the
rectangle and the browser composites it. A mostly-static desktop therefore uses a
small fraction of the bandwidth a full-frame stream would.

If the screen has not changed at all, nothing is sent except a keep-alive full
frame every `ALLEYESX_FULL_FRAME_KEEPALIVE` seconds (default 1s) so the UI does not
look frozen.

---

## 4. The seven analysis sensors

Each sensor has three parts: an agent collector, a backend table and endpoint, and
a frontend panel. All seven are live.

### Sensor 1 — Network flow and link sensor

**What it reads.** The kernel's own connection tables: `/proc/net/tcp` and
`/proc/net/udp` on Linux, `netstat -ano` on Windows, `netstat -an -p tcp` on macOS.
No root, no libpcap, no extra package.

**What it is not.** This is a **connection** sensor, not a packet sensor. It gives
protocol, local and remote address and port, and state. It does not give
per-packet timestamps, sizes or payload protocol. Every stored row carries a
`source` column reading `connection_table`, and the UI says *"Connection table, not
packet capture."* A real packet sensor would report `source='packet_capture'` and
the UI would change its own wording with no code change.

**Links.** `collect_link_neighbours()` reads `ip neigh` and `ip route` (`arp -a`
and `route print` on Windows), so the gateway and layer-2 neighbours are real.
**Links are drawn only between monitored devices** — a link appears when both ends
run an agent. An unmanaged neighbour is listed but deliberately not connected,
because an inferred link is worse than no link.

| Table | Columns |
|---|---|
| `network_connections` | device_id, seen_at, protocol, local_ip, local_port, remote_ip, remote_port, state, source |
| `network_links` | device_id, seen_at, neighbour_ip, neighbour_mac, interface, state, is_gateway |

| Endpoint | Purpose |
|---|---|
| `POST /api/device/<id>/connections` | ingest a snapshot (replaces the previous one) |
| `POST /api/device/<id>/links` | ingest neighbours and gateway |
| `GET /api/analysis/flows` | fleet-wide connections with established/listening/external counts |
| `GET /api/analysis/links` | neighbours plus derived device-to-device links |

Snapshots replace rather than accumulate, capped at 800 connections and 300 links
per device, because connections are a current state and old rows have no value.

### Sensor 2 — Operating-system log sensor

**What it reads.** `journalctl -o short-iso` on Linux, `Get-WinEvent` over System,
Application and Security on Windows, `log show` on macOS. Nothing is shipped that
the OS did not already record.

**Deduplication.** Events are inserted with `INSERT OR IGNORE` against a
`UNIQUE(device_id, ts, message)` constraint, so re-shipping the same window on the
next poll does not duplicate history. Verified: a second identical ingest inserts
zero rows.

**Why "no events" and "cannot read" are different.** The agent reports a sensor
status alongside the events. On a machine where the agent user lacks journal
permission it reports exactly that — *"journal access denied - run the agent as a
user in the systemd-journal or adm group"* — rather than implying the system is
quiet. The panel shows that reason.

**Severity** on Linux is coarse, derived from message text rather than a
structured level field. That limitation is recorded in the capability matrix.

| Table | Columns |
|---|---|
| `log_events` | device_id, ts, source, host, unit, event_id, message, severity, ingested_at + UNIQUE(device_id, ts, message) |

| Endpoint | Purpose |
|---|---|
| `POST /api/device/<id>/logs` | ingest events plus sensor status |
| `GET /api/analysis/logs` | filter by severity, device and text; counts by severity |

Capped at 4000 events per device.

### Sensor 3 — Sigma rule detection

**Where rules run.** In the backend, in `server/sigma_engine.py`, never in the
browser.

**The critical design decision.** A rule this engine cannot evaluate is reported
as `unsupported` with the reason. It is never evaluated as if it matched nothing.
A detection that appears to work but silently never fires is the worst possible
outcome for a detection engine. Verified: a rule using `|re` returns *"unsupported
modifier |re"*; a rule with no condition returns *"no condition"*.

**Supported subset.**
- field matching with `|contains`, `|startswith`, `|endswith`
- `field: [v1, v2]` — OR within a field
- `condition: selection`
- `condition: selection and not exclusion`

**Not supported, and reported as such.** Pipelines and field mappings, regular
expressions, base64, temporal and correlation rules, count aggregation.

**No PyYAML dependency.** The accepted subset is simple enough to parse directly,
which keeps both server and agent dependency-free. The parser tracks indentation so
`condition` is correctly read as a detection-level key rather than being nested
inside a selection.

**Four built-in rules**, seeded once and never overwriting an edited rule:

| Rule | Detection |
|---|---|
| SSH Brute Force Attempt | `sshd` + "Failed password" |
| Out Of Memory Kill | `kernel` + "Out of memory" |
| Privilege Escalation via sudo | `sudo` + "COMMAND=" |
| Service Failed to Start | `systemd` + "Failed", and not "Failed password" |

| Table | Columns |
|---|---|
| `sigma_rules` | rule_id, title, level, description, body, enabled, builtin |
| `sigma_matches` | rule_id, rule_title, level, device_id, log_event_id, ts, unit, message + UNIQUE(rule_id, log_event_id) |

Matches are unique per rule and event, so re-running evaluation does not duplicate
detections.

| Endpoint | Purpose |
|---|---|
| `GET /api/analysis/sigma/rules` | rules with parsed metadata and support status |
| `POST /api/analysis/sigma/run` | evaluate enabled rules against stored logs |
| `GET /api/analysis/sigma/matches` | stored detections with device hostnames |

### Sensor 4 — IOC detection

**The honesty decision.** No external threat-intelligence feed is connected, and
the panel says so in a banner. The API returns `external_feed_connected: false`
and every indicator carries `source`, defaulting to `analyst`. When a feed is
connected later it becomes the source and carries its own confidence, with no UI
change needed.

An indicator only produces a match when its value genuinely appears in collected
data. Verified: an IP indicator matched in both a log event and a connection,
while a process indicator that appears nowhere correctly returned zero hits rather
than a fabricated match.

Indicator types: `ip`, `domain`, `hash`, `process`, `url`. Bad types are rejected
with 400 and duplicates with 409.

| Table | Columns |
|---|---|
| `ioc_indicators` | value, type, source, confidence, severity, note, enabled + UNIQUE(value, type) |
| `ioc_matches` | indicator_id, value, type, source, confidence, severity, device_id, where_found, detail + UNIQUE(indicator_id, device_id, detail) |

`where_found` records whether a hit came from a `log_event` or a `connection`, so a
detection can be traced rather than just believed.

| Endpoint | Purpose |
|---|---|
| `GET`/`POST /api/analysis/ioc/indicators` | list and add indicators |
| `POST /api/analysis/ioc/run` | match against logs and connections |
| `GET /api/analysis/ioc/matches` | matches with device hostnames |

### Sensor 5 — AI Security Advisor

**Two layers, deliberately separated**, because presenting inference as telemetry
is the one thing this panel must never do.

| Layer | Source | Availability |
|---|---|---|
| **Observed facts** | derived deterministically from collected telemetry | always, no configuration |
| **Advisory** | model inference | only when `ALLEYESX_AI_ENDPOINT` is set |

Observed facts include fleet status, listening ports and high-risk count, firewall
and antivirus state, malware indicators, suspicious processes, open alerts, and the
highest-risk devices with their top factor.

With no endpoint configured the facts still render and the advisory section says
plainly that inference is unavailable. **It never substitutes a canned opinion for
a model** — an endpoint that returns nothing produces "no usable response", not a
plausible-sounding fabrication.

Configuration: `ALLEYESX_AI_ENDPOINT`, `ALLEYESX_AI_MODEL`, `ALLEYESX_AI_TOKEN`,
`ALLEYESX_AI_TIMEOUT`. Accepts an OpenAI-compatible body or a bare `{response}` /
`{text}` body.

| Endpoint | Purpose |
|---|---|
| `GET /api/analysis/ai` | observed facts always; advice only when configured, with `advice_is_inference: true` |

### Sensor 6 — Threat geography

Built on sensor 1, so the origins are traffic the agents actually observed, not
modelled attack traffic. Private ranges (`10.`, `192.168.`, `172.16.`, `127.`,
`169.254.`, `0.0.0.0`) are excluded.

**The honesty decision.** No geolocation service is configured, so **no coordinates
are emitted and no map arcs are drawn**. The API returns `geo_available: false` and
the panel says so in an amber banner. Inventing a latitude for an IP would be worse
than showing none.

The map component is already written — equirectangular projection, pulsing origin
markers, dot size scaled by connection count — and renders the moment
`geo_available` becomes true. No code change is needed to switch it on, only a
geolocation source.

| Endpoint | Purpose |
|---|---|
| `GET /api/analysis/threats` | external destinations grouped by origin, with counts, ports and devices |

### Sensor 7 — Anomaly detection

**Why it could not be built earlier.** Telemetry was a single row per device,
overwritten on every heartbeat, so there was no history to baseline against.

**`telemetry_history`** now appends cpu, ram, disk, net counters, open-port count,
process count and suspicious-process count on every heartbeat that actually carries
telemetry. **A telemetry-less heartbeat writes nothing** — a row of zeros would
poison the baseline, which is the same failure mode the traffic-samples guard
prevents. Capped at 4000 samples per device.

**This is statistics, not a model.** Every finding names the metric, the baseline
mean, the standard deviation, the observed value and how many standard deviations
away it sits, so a detection can be checked rather than taken on faith.

| Metric | Threshold |
|---|---|
| cpu, ram, disk | ≥ 2.5 sigma |
| open ports, suspicious processes | ≥ 2.0 sigma |

Fewer than 30 samples reports `BUILDING BASELINE` rather than inventing a
deviation. Metrics with **zero variance** in the baseline are never flagged,
because no deviation can be measured from a constant baseline.

**A statistical subtlety that matters.** The baseline is computed from the samples
*after* the current reading, excluding the current one. Including it would let a
spike contaminate its own baseline, inflating both the mean and the standard
deviation and making the very deviation being sought harder to see. Measured with
45 stable samples near 20% and a spike to 97%:

| | baseline mean | std dev | sigma |
|---|---|---|---|
| baseline includes current | 21.41 | 11.33 | 6.67 |
| baseline excludes current | 19.91 | 1.33 | **58.0** |

| Table | Columns |
|---|---|
| `telemetry_history` | device_id, ts, cpu, ram, disk, net_sent, net_recv, open_port_count, process_count, suspicious_count |

| Endpoint | Purpose |
|---|---|
| `GET /api/analysis/anomalies` | baseline vs current per device, with sigma and sample counts |

---

## 5. The Analysis page

Six categories, each an inset panel with a summary and an expandable workspace.
The interactive network topology map is reached from Topology Analysis >
Network Topology (it is deliberately not a sidebar entry). Device icons
render the OS logo while a device is online; the operator chooses the
drawing mode (Auto / OS / Device) on the Devices page and the topology
toolbar, persisted in localStorage.

| # | Category | Modules |
|---|---|---|
| 01 | Devices Analysis | Device Risk Ranking, USB Activity, Network Discovery, Device Deep Dive, Fleet Composition |
| 02 | Port Analysis | Nmap Scanner, Open Port Monitor, Attack Surface |
| 03 | Traffic Analysis | Protocol Statistics, Top Talkers, Live Connection Analysis |
| 04 | Topology Analysis | Network Topology (opens the /topology map), Threat Geography |
| 05 | Malware Analysis | Malware Behaviour, IOC Detection, Firewall Analysis, AI Security Advisor |
| 06 | Log Analysis | Session Monitoring, Log Analyzer, Sigma Detection, Anomaly Detection |

### The capability matrix

`src/components/analysis/capabilities.ts` is the single source of truth. Every
module declares its status — `ready`, `partial` or `deferred` — the telemetry
behind it, whether a time-range control is meaningful, and for partial modules
exactly what is missing and what a new sensor would unlock.

The UI reads it, so a module cannot render a chart for data that does not exist,
and the panel header shows the real data state rather than a generic label.

### Visual layer

Effects live in `index.css` and extend the existing theme rather than competing
with it. All decoration uses `transform` and `opacity` only, so it stays on the
compositor, and every effect is disabled under `prefers-reduced-motion`. Hover
effects are gated behind `@media (hover: hover)` so touch devices do not get stuck
hover states.

| Class | Effect |
|---|---|
| `.aeyes-inset` | hover wake: `translateY(-2px) scale(1.005)`, layered green glow |
| `.aeyes-inset__edge` | green signal riding the border, hover only |
| `.aeyes-inset__sweep` | horizontal light sweep at 8% alpha, never obscures text |
| `.aeyes-inset__corner` | HUD corner marks |
| `.aeyes-stat` | statistic cards brighten on hover |
| `.aeyes-live-dot` | ~2s pulse; amber variant for partial states |
| `.aeyes-panel-scan` | staggered scan line, 0–5s delay per category |
| `.aeyes-topo-rings` | contained rotating rings in Topology |
| `.aeyes-traffic-grid` | faint drifting grid in Traffic |

---

## 6. Device risk scoring

Risk is computed by one engine, `compute_device_risk()`, used by the Command
Center, the Analysis page and the Device Deep Dive so all three agree.

Risk starts at zero and points are added for observed problems. Every point names
its evidence, so the UI can explain *why* a device scored what it did. Nothing is
added without data behind it, and a clean device gets an empty reason list rather
than invented findings.

| Factor | Weight |
|---|---|
| Unresolved alerts | by severity: critical 12, high 7, medium 3, low 1 (capped at 30) |
| High-risk listening ports | 6 each, capped at 30 |
| More than 12 listening ports | 6 |
| Host firewall disabled | 15 |
| Antivirus inactive | 15 |
| Malware indicator | 35 |
| Suspicious processes | 8 each, capped at 25 |
| Critical CVEs | 5 each, capped at 20 |
| Disk encryption not detected | 5 |
| Agent offline | 10 |

Levels: `CRITICAL` ≥ 70, `HIGH` ≥ 45, `MEDIUM` ≥ 20, else `LOW`.

The Security page shows the same number as a *health* score (100 − risk) so the
two views cannot disagree.

---

## 7. Device lookups and the cache

`connected_devices` is a per-process in-memory cache, reloaded from the database
at startup. Endpoints use `_device_row()`, which checks the cache and falls back to
`SELECT * FROM devices WHERE id=? AND COALESCE(deleted,0)=0`.

This matters because a cache-only lookup would return "Device not found" for a
device that plainly exists in the table — which happens with more than one worker,
or a device registered through another process. Deleted devices stay excluded, so
removal still removes.

Two cache checks are deliberately left alone: the heartbeat, because the agent
relies on "Unknown device" to trigger re-registration, and the register handler's
new-device test.

---

## 8. Agent administration

Three administrative actions, all explicit, authenticated and audited.

| Action | Endpoint | Effect |
|---|---|---|
| Open device | — | navigates to the device page |
| **Break connection** | `POST /api/device/<id>/disconnect` | queues a `disconnect` task; the agent stops its own loop; the device record is kept so it can register again |
| Delete device | `POST /api/device/<id>/remove` | soft-deletes the record (`deleted=1`); a running agent will register again on its next heartbeat |

A disconnect is visible in the agent's own console — the person at the machine is
never left wondering why it stopped.

---

## 9. Alert deletion

`DELETE /api/alerts/<alert_id>` writes the alert's content into the audit trail
*before* removing the row, so deleting an alert does not also erase the evidence
that it existed. Unknown ids return 404 rather than a silent success. The UI uses
an inline Yes/No confirm.

---

## 10. Data model

32 tables. Grouped by what produces them.

**Device identity and inventory** — written by the agent at registration and on
inventory refresh.
`devices`, `os_info`, `hardware_info`, `processor_info`, `memory_info`, `gpu_info`,
`storage_devices`, `network_interfaces`, `peripherals`, `software_inventory`,
`device_preferences`

**Live telemetry** — written on every heartbeat.
`telemetry` (current state, one row per device), `telemetry_history` (appended
history), `traffic_samples`

**Sensor data** — written by the seven sensors.
`network_connections`, `network_links`, `log_events`, `sigma_rules`,
`sigma_matches`, `ioc_indicators`, `ioc_matches`

**Alerts and audit**
`alerts`, `notifications`, `audit_log`, `auth_attempts`

**Operations**
`command_results`, `pending_tasks`, `remote_sessions`, `security_scans`,
`screenshots`, `webcam_frames`, `daily_stats`

---

## 11. What the system honestly does not do

This is as important as what it does do.

| Claim it does not make | Why |
|---|---|
| Packet capture | it reads the kernel connection table, not packets |
| Geographic attack origins | no geolocation service, so no coordinates are emitted |
| Threat intelligence | no feed is connected; every indicator is analyst-supplied |
| Model inference by default | no endpoint configured; facts are shown instead |
| Predictive anomaly detection | statistics over history, not forecasting |
| Full Sigma compliance | a documented subset; unsupported rules are reported |
| Structured log severity on Linux | derived from message text |
| Inferred network links | links only between monitored devices |

Where data does not exist the UI says so — `NOT REPORTED`, `NO DATA AVAILABLE`,
`SENSOR NOT INSTALLED`, `BUILDING BASELINE`. It never shows a zero where the truth
is unknown, and never a sample row where the truth is absent.

---

## 12. Verification status

What has been verified, and how:

| Check | Result |
|---|---|
| `py_compile` (6 Python files) | clean |
| TypeScript `tsc --noEmit` | clean |
| Production build | clean |
| Unit tests | 25/25 |
| GET route sweep | 52 routes, 0 server errors |
| POST sweep with malformed input | 38 cases, 0 server errors |
| Real agent, 70 seconds | stable ~49.5 FPS, no errors |
| All seven sensors | verified against live agent data |

**Not verified:** the rendered UI. There is no browser in the development sandbox,
so every panel is verified through its API contract, the type system and unit
tests — not visually. The `journalctl` parse path also cannot be exercised there,
because the sandbox user has no journal permission; the log pipeline was verified
by posting events directly to the ingest endpoint.
