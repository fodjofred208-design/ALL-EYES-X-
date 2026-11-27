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

## Tailscale HTTPS and reusing the old name

First inspect `tailscale status` and `tailscale serve status` on the new
server. The name `meta-f.bittern-adelie.ts.net` belongs to the device identified
as `meta-f` in that tailnet; changing an IP or Caddy config does not transfer
it. If the old machine still owns that name, coordinate with the tailnet admin:
free or rename the old device **only after confirming its identity and recovery
needs**, then assign the available `meta-f` name to the new device through the
Tailscale admin console, if permitted. Confirm that the new device resolves to
`100.70.239.62` and that its actual HTTPS URL is the desired one. Names and
availability are controlled by Tailscale, and cannot be guaranteed here.

Enable MagicDNS and HTTPS certificates for the tailnet in the Tailscale admin
console if not already enabled. With the stack running, opt in to Serve:

```powershell
tailscale serve --bg --https=443 http://127.0.0.1:8080
tailscale serve status
```

This changes the new device's Serve configuration. Inspect existing Serve
configuration first; do not reset it blindly. Tailscale may require admin or
operator permissions and certificate approval. Follow any prompt and use the
actual URL reported by `tailscale serve status`. Alternatively, the launcher
can enable Serve with `.\start_all.ps1 -NoClient -Serve` after inspection.

From an authorized tailnet device, after the name is assigned and DNS has
updated:

```powershell
curl.exe -i https://meta-f.bittern-adelie.ts.net/
curl.exe -i https://meta-f.bittern-adelie.ts.net/api/auth/status
curl.exe -I --http2 https://meta-f.bittern-adelie.ts.net/
```

Do not use `-k`: certificate validation failures matter. Inspect the browser's
certificate details for the correct hostname and expiry. `curl.exe -V` shows
whether the local curl supports HTTP/2 or HTTP/3. `--http2` may negotiate a
fallback; inspect verbose output to confirm the protocol. Test HTTP/3 only if
both client and Tailscale Serve support it. Verify renewals on the actual device.

Use the application in a browser over HTTPS and inspect the network panel for a
successful `/socket.io/` WebSocket upgrade (101) and reconnect behaviour. Test
an authorized agent from a different tailnet device by configuring its server
URL and checking heartbeats. Tailnet ACLs, device approval, firewall rules,
DNS, HTTPS and certificates must all be verified on the actual machines.

## Sandbox validation and limits

Caddy 2.11.7: `fmt --overwrite`, `validate` and `adapt --validate` succeeded.
With a disposable Flask database and local Vite, the three local URLs returned
200, 200 and 302 respectively; proxied auth status, agent downloads and Engine.IO
polling returned 200. Socket.IO polling and WebSocket connections both succeeded,
as did synthetic agent registration and heartbeat through Caddy. No real
Tailscale daemon, Windows host, remote certificate, live customer agent, browser
or long-duration connection was available in the sandbox. No claim is made that
remote access, HTTP/2, HTTP/3 or renewal has already been verified there.
