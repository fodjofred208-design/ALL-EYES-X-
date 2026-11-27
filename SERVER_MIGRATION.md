# Moving ALL EYES X to the new Windows server

The new server's reported Tailscale IPv4 address is **100.70.239.62**. This is a
configuration, not proof of connectivity: sign in to the correct tailnet on the
new computer and verify `tailscale ip -4` first. If it differs, use the actual
address instead. Use this software only on systems you are authorized to manage.

## 1. Install and prepare

Install Python 3.12, Node.js 22 LTS, Tailscale, and VS Code. Sign in to Tailscale
and check its address. Download and extract this project, then open the project
root (where `requirements.txt` is) in VS Code. In a PowerShell terminal:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
```

If the local agent will be used on this computer, also install its optional
features:

```powershell
.\.venv\Scripts\python.exe -m pip install requests psutil pillow mss pyautogui opencv-python pynput numpy
```

Install Nmap separately only if Nmap scanning is needed. Caddy is optional for
manual startup; install it and put it on PATH to use the launcher's default.

## 2. Protect the server

Change the default administrator password and secret key before connecting
other devices. Set `ADMIN_USER`, `ADMIN_PASS` and `SECRET_KEY` as environment
variables on the new server; keep their values private. They must be present in
the terminal that starts the server, or configured securely for the account.
Set `RECOVERY_PHRASE_HASH` as described in README.md. The development server's
debugger is off by default; do not enable it on a reachable network.

The existing agent and remote-control endpoints are not a hardened public
service. Do not port-forward them to the internet; restrict Windows Firewall and
Tailscale access to trusted administrators and authorized agents. Tailscale
connectivity alone does not replace application authentication.

## 3. Start the server and dashboard

The requested Tailscale dashboard address is
`https://all-eyes-x-server.bittern-adelie.ts.net/`. Confirm that the new
device owns this MagicDNS name and that Tailscale Serve proxies HTTPS to Caddy
on 8080; see `CADDY_AUDIT.md`. This is tailnet access, not necessarily public
internet access. Existing agents retain their configured addresses.

From the project root, open two PowerShell terminals:

```powershell
# Terminal 1: backend
.\.venv\Scripts\python.exe server\app.py
```

```powershell
# Terminal 2: frontend
npm run dev
```

On the server, open `http://127.0.0.1:5173`. From an authorized computer on
the same tailnet, try `http://100.70.239.62:5173`. This is plain HTTP, not an
internet-facing production deployment. Caddy on port 8080 is optional; for
HTTPS use Tailscale Serve and the **new machine's actual** MagicDNS name as
shown by Tailscale, not the old server's hostname.

Windows Firewall and tailnet policies may block access. Allow only the required
ports for trusted Tailscale peers: 5000 for agents; 5173 for direct Vite access,
or 8080 for Caddy if used. Do not open ports broadly to public networks.

Alternatively, after installing Caddy, `./start_all.ps1` starts Caddy, Flask,
Vite and a local agent. It now prefers `.venv` when present. Use `-NoCaddy` if
Caddy is not installed, and `-NoClient` if this computer should not run an agent.
`-Serve` changes Tailscale Serve configuration and is opt-in.

## 4. Move agents

The updated `client/client.py` and downloadable `server/static/client.py` use
`http://100.70.239.62:5000` by default. Existing installations on other
machines do **not** update themselves: replace them with the updated agent or
explicitly set the address, and restart each agent. For example:

```powershell
python client.py http://100.70.239.62:5000
```

The command-line URL overrides `ALL_EYES_SERVER`, which overrides the default.
A local agent on the server can use `http://127.0.0.1:5000`. Each remote machine
must be signed in to the correct tailnet and able to reach port 5000. If the
server IP changes again, set the new URL rather than relying on this default.

## 5. Previous history and troubleshooting

The GitHub project ZIP is not a backup of the old machine's live data. If the
old server is recoverable and you need its history, securely back up its
`server/aeyes_data.db` using SQLite's backup mechanism or after cleanly stopping
the old server and checkpointing its WAL. Back up the new server's database
first, stop the new server before restoring, and restore only a trusted backup.
Do not copy a live database without its WAL or overwrite new data accidentally.
If the old machine is unavailable and there is no backup, old history cannot be
recovered from the project alone. Agents must reconnect to populate new data.
Treat the database as sensitive; do not publish or share it.

If `eventlet` is missing, use `.\.venv\Scripts\python.exe` both to install the
requirements and to start the server. Check Tailscale IP/sign-in, process logs,
Windows Firewall and tailnet policy if agents do not connect. This guide cannot
verify the user's actual Windows or Tailscale configuration remotely.
