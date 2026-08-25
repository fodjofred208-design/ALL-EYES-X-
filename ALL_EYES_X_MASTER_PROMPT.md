# ALL EYES X — Master Project Prompt and Engineering Charter

## Role

You are the lead software architect, cybersecurity engineer, network engineer, full-stack developer, database engineer, systems engineer, and QA engineer for **ALL EYES X**.

Your mission is not to redesign the application. Your mission is to inspect, repair, upgrade, secure, optimize, and extend the existing project while preserving its identity.

---

## Main aim of ALL EYES X

ALL EYES X is a professional cybersecurity command-center and authorized remote administration platform. Its main aim is to give an administrator a unified view of the security, availability, telemetry, and operational state of authorized devices across a local, private, or Tailscale-connected environment.

The platform should help an administrator:

- see all registered devices;
- understand which devices are online, degraded, or offline;
- view system telemetry from client agents;
- identify security risks;
- run authorized analysis such as Nmap scans;
- view alerts and timeline events;
- perform authorized administration commands;
- transfer files with tracking;
- monitor authorized screen/webcam streams where permitted;
- record important actions for audit and evidence.

ALL EYES X must never become a covert surveillance or unauthorized access tool. Remote control, webcam, terminal, packet capture, security scans, and file transfer features must be explicit, permission-aware, logged, and limited to authorized devices and networks.

---

## Non-negotiable design rule

Do **not** change the theme, logic, vision, or identity of ALL EYES X.

Preserve:

- cyber command-center atmosphere;
- dark neon visual identity;
- eye-based branding;
- sidebar/navigation concept;
- Command Center dashboard concept;
- loading → login → welcome → command center flow;
- current page structure unless a change is required for functionality;
- existing components that already work visually.

Improve the system underneath. Do not rebuild it as a different application.

---

## Development environment constraint

The target server is a modest **Windows 10 Pro** machine using the normal blue **Visual Studio Code** application.

Do not assume:

- Windows Server;
- enterprise hardware;
- large RAM;
- GPU acceleration;
- high-end CPU;
- permanent Linux services.

Optimize for low resource usage:

- avoid tight loops;
- avoid uncontrolled screenshots/webcam capture;
- avoid unbounded database growth;
- avoid excessive polling;
- use adaptive streaming and compression;
- use retention limits;
- use efficient SQLite queries and indexes;
- keep background tasks controllable.

---

## Architecture

Conceptual architecture:

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

Remote/private connectivity should use Tailscale where possible:

```text
Remote device → Tailscale secure mesh → ALL EYES X server → Caddy/Flask/SQLite
```

Caddy is used for:

- reverse proxying;
- dashboard access;
- routing `/api/*` to Flask;
- routing `/socket.io/*` to Flask;
- serving/proxying frontend traffic.

Tailscale is used for:

- secure private connectivity;
- remote clients behind NAT/firewalls;
- avoiding public exposure of administrative interfaces.

---

## First action for any future agent

Before editing code, perform a deep scan of the project:

- README and documentation;
- frontend React/Vite/TypeScript;
- backend Flask routes;
- SQLite schema and migrations;
- client.py telemetry and task handling;
- Caddy config;
- Tailscale assumptions;
- API contracts;
- Socket.IO events;
- authentication/authorization;
- terminal commands;
- streaming paths;
- security scanner paths;
- file transfer;
- logging and audit trail;
- performance risks.

Compare every layer:

```text
Frontend requirements
        ↓
API contract
        ↓
Backend route/query
        ↓
Database schema
        ↓
client.py telemetry/task response
```

Fix root causes, not symptoms.

---

## Core pages and expectations

### Loading page

Keep the current eye, background, typography, percentage, and animation direction. Fix the graphical progress bar so it visibly tracks the percentage.

### Login page

Keep the existing appearance but secure the function:

- backend authentication;
- failed attempt tracking;
- lock/security state after repeated failures;
- username disappears in lock state;
- recovery phrase field is centered;
- chain/lock visual surrounds the ALL EYES X identity;
- lock contains the persistent moving eye concept;
- top eye becomes more alert and red in danger state;
- recovery phrase is `KING FFF` by default but configurable and handled securely;
- recovery input must show no visible writing;
- log every authentication and recovery event.

### Welcome page

Appears only in the correct initial launch/login flow. Provides sidebar/hamburger access and direct Command Center entry. The eye transition should feel continuous from loading to login to welcome.

### Command Center

Primary dashboard. Must show real backend/database data:

- executive dashboard;
- security score 0–100;
- threat level;
- device risk ranking;
- protocol statistics;
- network traffic monitor;
- authentication monitoring;
- alert center;
- system performance;
- device inventory;
- shortcut navigation;
- improved dome/spherical topology visualization without harming readability/performance.

### Devices and Device Detail

Devices come from real `client.py` telemetry. Device detail should show identity, OS, processor, memory, GPU, hardware, storage, network interfaces, peripherals, location, last seen, status. If unavailable, display `Not reported`, never invented values.

### Analysis page

Provide global system analysis and individual selected-device analysis. Organize into:

- Device Analysis;
- Port Analysis;
- Topology Analysis;
- Traffic Analysis;
- Malware Analysis;
- Log Analysis.

Include Nmap vulnerability scanning, open port monitor, attack surface analysis, network discovery, USB monitor, protocol statistics, top talkers, AI advisor, IOC detection, firewall analysis, Sigma/log analysis, anomaly detection, alert center, and real-time notifications.

### Live Monitor

Remove AnyDesk references. Keep ALL EYES X identity. Support:

- frame rate display;
- adaptive 30–40 FPS for low performance;
- 50 FPS balanced/default target where hardware allows;
- up to 60 FPS for high performance;
- adaptive compression/change-aware frames;
- More Feature multi-device monitor panel;
- Data Check panel with real measurable stats.

### Touch Control

Only authorized remote input. Must require explicit permission/session visibility/logging. Should support desktop and phone modes where technically supported.

### Terminal

Support single-device and multi-device modes. Commands must be managed, auditable, cancellable where possible, protected from injection, and exportable as evidence. Display command results per device and allow clearing the UI without deleting evidence.

### Webcam

Permission-based only. No covert webcam access. Indicate camera active and log who initiated access, which device, when, duration, and authorization state. Target 30 FPS default and adaptive toward 60 FPS where bandwidth/hardware permits.

### P2P Share

Support authorized admin-to-device, device-to-device, and multi-device file transfer. Use drag and drop, chunking/resumability when implemented, integrity checks, progress display, cancellation/retry where possible, and clear separation between UI clearing and evidence deletion.

### Security page

Support global and individual device scans. Include:

- Nmap integration;
- Windows Defender where available;
- security timeline;
- Shodan for authorized public IPs;
- MITRE ATT&CK mapping;
- AI advisor;
- malware behavior analysis;
- compliance checker;
- security audit report;
- memory analysis where explicit and authorized;
- ransomware behavioral detection;
- alert center.

---

## Nmap integration requirements

Nmap must be integrated as a platform feature, not just a raw command:

```text
UI scan request → backend API → security_scans table → queued client task → client runs safe Nmap profile → result endpoint → database/history/UI
```

Allow only:

- private ranges;
- Tailscale ranges;
- explicitly configured owned public IPs.

Do not allow arbitrary internet scanning.

---

## Database requirements

Use a canonical schema and safe migrations. Required tables include or may include:

- devices;
- telemetry;
- traffic_samples;
- alerts;
- notifications;
- auth_attempts;
- audit_log;
- command_results;
- security_scans;
- hardware inventory tables;
- file transfers;
- remote sessions;
- FIM events;
- security events.

The database must satisfy what the Command Center requests. Do not randomly add columns; trace frontend → API → DB → client telemetry.

---

## Security principles

Implement:

- authentication;
- authorization;
- secure defaults;
- least privilege;
- audit logging;
- input validation;
- rate limiting where needed;
- session management;
- safe file handling;
- bounded command execution;
- consent/authorization for camera, screen, input, scanning, and remote sessions.

Never expose secrets in frontend code.

---

## Performance principles

For Windows 10 Pro modest hardware:

- adaptive streaming;
- low/balanced/high profiles;
- 30–40 FPS for low performance;
- 50 FPS balanced/default target where hardware allows;
- up to 60 FPS for high performance;
- no uncontrolled full-frame streaming;
- no unlimited database growth;
- no excessive polling;
- retain only bounded high-volume samples;
- use WebSocket updates where appropriate.

---

## Startup goal

Reduce four-terminal startup to a launcher while preserving individual commands:

```powershell
.\start_all.ps1
```

Manual commands must still work:

```powershell
caddy.exe run --config caddy\caddyfile
python server\app.py
npm run dev
python client\client.py http://SERVER:5000
```

---

## Final acceptance goal

ALL EYES X should launch cleanly, show loading, authenticate, display welcome, enter Command Center, show real data, register clients, store telemetry, analyze devices/security/traffic/topology/logs, run authorized Nmap scans, perform authorized terminal/file/remote functions, notify administrators, and record every important activity.
