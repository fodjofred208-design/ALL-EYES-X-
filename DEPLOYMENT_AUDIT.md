# Deployment and lab review

## Caddy 502: diagnosis and recovery

Caddy's `serving initial configuration` means it started. `dial tcp 127.0.0.1:5173 ... actively refused` means the Vite upstream was not listening at the moment of the request; it does not identify why Vite stopped or failed to start. Starting `caddy.exe run` alone does not start Vite or Flask. The HTTP/2 and HTTP/3 warnings on plain HTTP port 8080 are expected: HTTPS terminates at Tailscale, not on that Caddy listener. They are not the 502 cause.

Caddy now tries Vite as before. If the UI upstream returns a 502, it retries dashboard requests against Flask's existing `dist/` SPA. API, Socket.IO and agent downloads still route directly to Flask, not the UI fallback. **Flask must run on port 5000 and the built files must be present and current**. After changing frontend code, run `npm ci` and `npm run build` from the project root. A browser that was already using Vite may need a full reload when switching to the fallback. A missing Flask service is still an error, not a successful fallback. The original configuration before this change is `caddy/caddyfile.before-fallback`.

Recommended Windows startup, from PowerShell at the project root after installing Node.js 20.19+ or 22.12+ and Python dependencies:

```powershell
npm ci
npm run build
.\start_all.ps1 -Caddy "C:\path\to\caddy.exe"
```

Replace the Caddy path with the actual executable path; omit `-Caddy` if `caddy.exe` is on PATH. If Caddy was already started by hand, stop it first with Ctrl+C to avoid a port conflict. `start_all.ps1` starts Flask, Vite and Caddy, and reports startup failures in `logs\*.err.log`. Check ports in PowerShell:

```powershell
Test-NetConnection 127.0.0.1 -Port 5000
Test-NetConnection 127.0.0.1 -Port 5173
Test-NetConnection 127.0.0.1 -Port 8080
```

If 5173 is down, inspect `logs\vite.err.log` and `logs\vite.out.log` or run `npm run dev` in a separate project-root terminal. If 5000 is down, inspect Flask's logs and verify `.venv\Scripts\python.exe -m pip install -r requirements.txt`. A listening port alone does not prove the correct application owns it. For remote HTTPS verify `tailscale serve status`; `start_all.ps1 -Serve` changes Serve configuration and requires appropriate rights.

## Important security warning

The supplied log includes `Tailscale-Funnel-Request`, indicating the requests arrived through **Tailscale Funnel**, which can expose the service to the public internet, not just the tailnet. This is particularly risky here: several agent HTTP routes and Socket.IO events do not authenticate the agent or connection, some events are broadcast, and default administrator credentials and a default session secret exist in source. Do not publish this service to the internet in its current state. Inspect `tailscale funnel status` and, if public access was not explicitly intended, disable Funnel with `tailscale funnel off`; verify `tailscale serve status` and tailnet ACLs separately. Restrict access to trusted authorized devices and interfaces with host firewall and Tailscale ACLs, and do not expose the direct development or backend ports. Set unique strong `ADMIN_USER`, `ADMIN_PASS`, and `SECRET_KEY` environment variables before starting Flask; see the application's configuration. This alone does **not** secure unauthenticated agent and socket traffic. A compatible agent-identity/authentication and event-authorization design remains necessary before public deployment. Rotate any credentials that may have been exposed and review logs.

## Review and changes

- Preserved the React/Flask/Socket.IO/SQLite/Caddy architecture. Corrected the documented browser → Caddy → Vite/API routing. Existing `dist/` is regenerated to match the current source for Flask standalone/fallback use; legacy tracked bundles remain for compatibility.
- Updated Vite and router dependencies and refreshed vulnerable transitive lockfile entries; `npm audit` reported zero known vulnerabilities at the time of the check. The build still warns that the main JavaScript bundle is large (~1.24 MB before gzip), which may slow initial mobile loads.
- Added a Flask-session check to Socket.IO remote input to match the HTTP input endpoint; this does not fix the broader agent/socket authorization risks above.
- Corrected the agent's Nmap capability to check the executable on PATH and changed frame-rate logs to count server-acknowledged frames, rather than main-loop iterations. The downloadable and local agent files remain identical.
- Made the target-device selector available in the phone navigation drawer, fixed the menu button's close behavior, and adjusted narrow-screen title/login sizing. These are incremental improvements, not a guarantee that every page, chart, stream, orientation or phone model is fully adapted.
- Eventlet emits a deprecation notice; migration requires a separate compatibility project. Python requirements use ranges rather than a fully pinned lock; `pip check` checks dependency consistency, not security advisories.
- SQLite integrity and foreign-key checks passed on the existing database, but it and a transfer image are tracked in Git. Review these for private data and repository exposure; no incidental data or history was removed. The legacy `payload/stager.ps1` points to a placeholder endpoint and uses hidden persistence; it was not run and should not be used without an explicit authorized review.

## Lab coverage and limitations

A disposable Linux copy with a fresh SQLite database was used: 64 GET routes produced no 500 responses (missing resources gave 404s); synthetic registration and heartbeat worked. A real Linux agent registered and sent inventory/heartbeats via Caddy. Caddy config validated; Vite and built-UI fallback, API, and Socket.IO WebSocket and polling paths were exercised. Automated TypeScript, frontend tests and Python regression tests passed. No real user's database was changed by these tests.

Windows 10, an actual phone browser, Tailscale DNS/certificates/Serve/Funnel state, cameras, touch hardware, and production network behavior were not available in the lab. Re-test on those devices before relying on deployment; these checks do not prove the entire project is fault-free. In particular, visual and touch behavior still requires actual phone testing across the dashboard and other pages.
