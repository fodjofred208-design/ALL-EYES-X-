# ALL EYES X: Caddy and Tailscale audit

## Architecture and findings

The checked-in `caddy/caddyfile` listens on **HTTP port 8080**. It sends
`/api/*`, `/socket.io/*`, `/static/*` and `/client.py` to Flask on port 5000;
other requests go to Vite on port 5173. Caddy automatically forwards WebSocket
upgrades. The React client uses same-origin API and Socket.IO URLs. Agents
normally use the Tailscale IP and port 5000 directly; Caddy also proxies their
API routes on 8080. Do not change existing agent URLs without updating each agent.

- **Loopback resolution:** upstreams now use `127.0.0.1` rather than
  `localhost`, avoiding a possible IPv6 `::1` versus IPv4-only listener mismatch.
  Vite uses the same explicit loopback for its API and Socket.IO proxies.
  An initial test also saw 502 while Vite was not yet ready; the launcher now
  waits for upstream ports before starting Caddy.
- **Formatting warning:** the input had inconsistent indentation. The original
  is preserved in `caddy/caddyfile.original`; `caddy fmt --overwrite` formatted
  the active file without changing its routes.
- **HTTP/2 and HTTP/3 warnings:** expected on this non-TLS HTTP listener.
  Caddy is not serving the public-facing TLS endpoint in this configuration.
  TLS for the tailnet hostname is terminated by Tailscale Serve when explicitly
  enabled. The warnings are left enabled, not hidden. Do not infer that Serve
  supports HTTP/3: test the actual installed Tailscale version and client.
- **Certificates:** this Caddyfile configures no hostname and does not obtain a
  certificate for the Tailscale name. Tailscale Serve handles HTTPS and its
  certificate when HTTPS is enabled on the tailnet. Check the actual server's
  hostname, certificate, renewal and Serve status there; they cannot be verified
  from the repository or a different computer.
- **Admin API:** Caddy defaults to `localhost:2019`. Keep it on loopback; do
  not forward 2019 or make it publicly accessible. The test instance listened
  on loopback, but verify the real machine's configuration and listeners.
- **Security:** ports 5000, 5173 and 8080 bind to all interfaces in the current
  development setup. Vite's `allowedHosts: true` permits arbitrary hostnames.
  Some agent and Socket.IO functions are not protected by the dashboard login.
  Tailscale does not turn them into hardened public endpoints. Restrict access
  with Windows Firewall and tailnet policy to trusted devices, avoid public
  port forwarding/Funnel, and use strong credentials and a private secret key.
  The backend also trusts the first `X-Forwarded-For` value for login audit and
  lockout accounting; it can be spoofed without a correctly configured trusted
  proxy boundary. This audit did not change backend authentication or proxy
  trust, so restrict network access and treat these as unresolved security risks.
  Do not regard this development setup as a hardened public deployment.
- **Startup:** the launcher previously printed success even when an upstream
  process exited. It now waits for ports 5000, 5173 and (unless `-NoCaddy`) 8080,
  reports a timeout and log paths, and stops on a failed Tailscale Serve command.
  A listening port alone does not prove it is the expected application.

## Start on the Windows server

Open PowerShell in the project root. Install Python/Node dependencies as in
`SERVER_MIGRATION.md`, ensure `caddy.exe` and `tailscale.exe` are on PATH, and
sign in to the correct tailnet. Check the server identity first:

```powershell
tailscale status
tailscale ip -4
caddy version
caddy validate --config .\caddy\caddyfile --adapter caddyfile
```

Start the services without changing Tailscale settings:

```powershell
.\start_all.ps1 -NoClient
```

If PowerShell blocks the script, use `Set-ExecutionPolicy -Scope Process
-ExecutionPolicy Bypass` for this terminal only. Logs are in `logs\`. Existing
listeners are skipped, so check the owning process if an unexpected service
already occupies a port. For example:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 5000,5173,8080,2019 } |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

## Test the three local addresses

```powershell
curl.exe -i http://127.0.0.1:8080/
curl.exe -i http://127.0.0.1:5173/
curl.exe -i http://127.0.0.1:5000/
curl.exe -i http://127.0.0.1:8080/api/auth/status
curl.exe -i http://127.0.0.1:8080/client.py
curl.exe -i "http://127.0.0.1:8080/socket.io/?EIO=4&transport=polling"
```

8080 and 5173 should return the frontend HTML. Flask `/` may return **302 to
`/login`** before login; that is a successful connection, not an error. Use
`curl.exe -i -L http://127.0.0.1:5000/` to follow the redirect; Flask's standalone
frontend needs `npm run build` first. The auth-status and agent-download routes
should return 200; polling should begin with an Engine.IO open packet. A 502
from Caddy usually means the relevant upstream is stopped or unreachable;
inspect the logs and listener ownership. A 401 on a protected API without a
login cookie is expected. Port readiness and HTTP responses alone do not prove
the UI, WebSocket lifetime, or agent is functioning.

## Tailscale HTTPS: new server name

The requested dashboard URL is **https://all-eyes-x-server.bittern-adelie.ts.net/**.
This is a tailnet URL, not necessarily a public-internet URL. The Caddyfile
already proxies `/api/*` and `/socket.io/*` directly to Flask on 5000; all
other frontend requests go to Vite on 5173. React uses same-origin API and
Socket.IO paths, so there is no need to hard-code a browser-facing API IP.

On the new Windows server, first verify the actual device identity and existing
Serve configuration:

```powershell
tailscale status
tailscale ip -4
tailscale serve status
```

The device must actually own the `all-eyes-x-server` MagicDNS name in this
tailnet. Configure its name and enable MagicDNS and HTTPS certificates in the
Tailscale admin console if necessary. Caddy cannot assign that name or issue a
Tailscale Serve certificate by itself. Preserve any existing Serve rules: inspect
them before intentionally setting the HTTPS proxy. With the stack running:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

This changes the new device's Serve configuration, and may require operator or
administrator permission. Alternatively use `.\start_all.ps1 -NoClient -Serve`.
Confirm that status reports this device's desired hostname and forwards HTTPS to
8080. Check from an authorized device in the same tailnet:

```powershell
curl.exe -i https://all-eyes-x-server.bittern-adelie.ts.net/
curl.exe -i https://all-eyes-x-server.bittern-adelie.ts.net/api/auth/status
curl.exe -i "https://all-eyes-x-server.bittern-adelie.ts.net/socket.io/?EIO=4&transport=polling"
```

Do not use `-k`: certificate validation failures matter. Inspect the browser's
certificate hostname and expiry and test renewal on the actual device. Confirm
HTTP/2 or HTTP/3 only if the installed client and Tailscale Serve support them.

## Diagnosing Vite WebSocket ECONNABORTED

The Node stack trace is from Vite's Socket.IO WebSocket proxy writing to a
connection that was aborted. It does **not** identify which peer closed it or
why. Browser navigation, a server restart, a proxy/network interruption,
firewall software and backend failure can all terminate a connection. A single
aborted connection is not proof of a permanent fault, but repeated failures
need investigation. Do not suppress the log or assume the React dependency
installation is corrupt.

Use the HTTPS hostname above after checking Serve targets Caddy on 8080: Caddy
routes `/socket.io/*` **directly** to Flask rather than through Vite. If the
error persists on that path, confirm the browser's network panel shows the
failing URL and transport, and compare `logs\vite.err.log`,
`logs\caddy.err.log`, `logs\flask.err.log`, Tailscale status and the exact
failure time. `http://127.0.0.1:5173` still uses Vite's proxy by design.
Do not post credentials, recovery phrases, session cookies or sensitive device
data with logs.

The client prefers WebSocket, retries on disconnection and now explicitly tries
polling if the first WebSocket transport fails. Previously listing both
transports was insufficient because `tryAllTransports` was not enabled. This
improves availability when WebSocket establishment fails; polling does not
repair the underlying network or a recurring proxy error. The UI's connection
state and browser console remain visible for diagnosis. Check a WebSocket 101
upgrade and reconnection with an authorized browser, then test a remote agent's
heartbeat. The agent continues to use its configured server URL, currently
`http://100.70.239.62:5000` by default; it does not need the dashboard URL.

## Sandbox validation and limits

Caddy 2.11.7: `fmt --overwrite`, `validate` and `adapt --validate` succeeded.
With a disposable Flask database and local Vite, the three local URLs returned
200, 200 and 302 respectively; proxied auth status, agent downloads and Engine.IO
polling returned 200. Socket.IO polling and WebSocket connections both succeeded,
as did synthetic agent registration and heartbeat through Caddy. No real
Tailscale daemon, Windows host, remote certificate, live customer agent, browser
or long-duration connection was available in the sandbox. No claim is made that
remote access, HTTP/2, HTTP/3 or renewal has already been verified there.

Latest connection checks used the updated Socket.IO client with an isolated
server: a Vite-proxied WebSocket stayed connected for 30 seconds; forcing the
WebSocket upgrade to fail switched the client to polling; simulating a transport
close reconnected; Caddy passed both polling and WebSocket connections. The
new hostname was tested as a local Host header, not against live Tailscale DNS
or TLS. Windows-specific ECONNABORTED remains unconfirmed until the user's
machine and logs can be inspected.
