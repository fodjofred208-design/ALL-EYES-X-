#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║      ALL EYES X — Dashboard Intelligence Engine v1.0         ║
║                                                              ║
║  Single source of truth for EVERY number on the Command      ║
║  Center. app.py imports this module and registers thin       ║
║  endpoints; client.py feeds telemetry through app.py;        ║
║  the React frontend only renders what this module returns.   ║
║                                                              ║
║  Modules: security score, threat level, device risk,         ║
║  traffic, protocols, auth monitor, system health, charts,    ║
║  trends, geo, footer summary.                                ║
╚══════════════════════════════════════════════════════════════╝
"""
import os
import time
import socket
import sqlite3


def build_devices_payload(rows):
    """Robust device row -> JSON. Accepts any column spelling."""
    out = []
    for r in rows:
        d = dict(r) if hasattr(r, "keys") else {}
        device_id = d.get("device_id") or d.get("id")
        if device_id is None:
            continue
        status = d.get("status") or ("online" if d.get("online") else "offline")
        risk = float(d.get("risk") or d.get("risk_score") or 0)
        hostname = d.get("hostname") or d.get("name") or d.get("device_name") or str(device_id)
        out.append({
            "device_id": device_id,
            "id": d.get("id") or device_id,
            "hostname": hostname,
            "name": hostname,
            "os": d.get("os") or d.get("platform") or "—",
            "ip": d.get("ip") or d.get("ip_address") or "—",
            "mac": d.get("mac") or d.get("mac_address") or "—",
            "status": status,
            "online": status.lower() == "online",
            "last_seen": d.get("last_seen") or d.get("updated_at") or d.get("heartbeat_at"),
            "risk": risk,
            "risk_level": d.get("risk_level") or ("CRITICAL" if risk >= 70 else "HIGH" if risk >= 40 else "MEDIUM" if risk >= 20 else "LOW"),
            "location": d.get("location"),
            "country": d.get("country"),
            "city": d.get("city"),
        })
    online = sum(1 for x in out if x["online"])
    return {"total": len(out), "online": online, "offline": len(out) - online, "list": out}
import threading
from datetime import datetime, timedelta
from collections import defaultdict, deque

VERSION = "3.4"
DASHBOARD_VERSION = "3.4.0"

# ============================================================
# MODULE STATE (bound by app.py via init_engine)
# ============================================================
_db_path = None
_devices = None          # reference to app.connected_devices dict
_socketio = None
_start_time = time.time()

# live rings (bounded memory)
_traffic_history = deque(maxlen=120)   # {ts, dl, ul, active_dev, active_bytes}
_system_ring = deque(maxlen=120)       # {ts, cpu, ram, disk, online, total}
_threat_ring = deque(maxlen=120)       # {ts, level, score}

# per-device telemetry
_telemetry = {}          # device_id -> last telemetry dict
_net_prev = {}           # device_id -> (ts, sent, recv)
_auth_lockout = {}       # username -> (fail_count, locked_until_ts)
_brute_track = {}        # ip -> [(ts, success)]
_last_internet_check = 0.0
_internet_cache = None
_last_daily_snapshot = 0.0
_last_api_call = time.time()
_last_heartbeat = time.time()
_last_frontend_ping = time.time()
_monitor_alive = True

PROTOCOL_BASELINE = [
    {"name": "TCP",   "percent": 42.0, "packets": 4200, "volume_mb": 5120},
    {"name": "UDP",   "percent": 18.0, "packets": 1800, "volume_mb": 2048},
    {"name": "HTTP",  "percent": 12.0, "packets": 1200, "volume_mb": 1536},
    {"name": "HTTPS", "percent": 9.0,  "packets": 900,  "volume_mb": 1280},
    {"name": "DNS",   "percent": 6.0,  "packets": 600,  "volume_mb": 64},
    {"name": "SSH",   "percent": 4.0,  "packets": 400,  "volume_mb": 128},
    {"name": "ICMP",  "percent": 3.0,  "packets": 300,  "volume_mb": 16},
    {"name": "SMB",   "percent": 2.0,  "packets": 200,  "volume_mb": 512},
    {"name": "FTP",   "percent": 2.0,  "packets": 200,  "volume_mb": 256},
    {"name": "RDP",   "percent": 1.0,  "packets": 100,  "volume_mb": 192},
    {"name": "ARP",   "percent": 1.0,  "packets": 100,  "volume_mb": 8},
    {"name": "DHCP",  "percent": 1.0,  "packets": 100,  "volume_mb": 8},
    {"name": "SMTP",  "percent": 0.7,  "packets": 70,   "volume_mb": 96},
    {"name": "POP3",  "percent": 0.4,  "packets": 40,   "volume_mb": 32},
    {"name": "IMAP",  "percent": 0.5,  "packets": 50,   "volume_mb": 48},
]

DANGEROUS_PORTS = [21, 23, 445, 3389, 5900, 1433, 3306, 6379]

THREAT_BANDS = [
    (0, 20, "LOW"),
    (20, 40, "MEDIUM"),
    (40, 70, "HIGH"),
    (70, 100, "CRITICAL"),
]


def init_engine(db_path, devices_ref, socketio_ref):
    """Called once from app.py at startup."""
    global _db_path, _devices, _socketio
    _db_path = db_path
    _devices = devices_ref
    _socketio = socketio_ref


def _db():
    conn = sqlite3.connect(_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


# ============================================================
# PUSH HELPER — only changed section re-renders on frontend
# ============================================================
def push(section, data):
    if _socketio is not None:
        try:
            _socketio.emit('dashboard_update', {"section": section, "data": data})
        except Exception:
            pass


def mark_api_call():
    global _last_api_call
    _last_api_call = time.time()


def mark_heartbeat():
    global _last_heartbeat
    _last_heartbeat = time.time()


def mark_frontend_ping():
    global _last_frontend_ping
    _last_frontend_ping = time.time()


def set_monitor_alive(alive):
    global _monitor_alive
    _monitor_alive = alive


# ============================================================
# TELEMETRY INGEST — called from /api/heartbeat
# ============================================================
def process_telemetry(device_id, data):
    """Update traffic, system ring, and per-device telemetry from
    one enriched heartbeat. Called by app.py on every heartbeat."""
    global _last_heartbeat
    _last_heartbeat = time.time()

    now = time.time()
    _telemetry[device_id] = {"ts": now, **data}

    # --- bandwidth deltas (psutil net counters from client) ---
    sent = data.get("net_sent")
    recv = data.get("net_recv")
    if sent is not None and recv is not None and device_id in _net_prev:
        pts, psent, precv = _net_prev[device_id]
        dt = max(now - pts, 0.001)
        dl = max(recv - precv, 0) / dt
        ul = max(sent - psent, 0) / dt
        if dl > 0 or ul > 0:
            _traffic_history.append({
                "ts": now, "dl": dl, "ul": ul,
                "active_dev": device_id,
                "active_bytes": max(recv - precv, sent - psent, 0),
            })
    _net_prev[device_id] = (now, sent or 0, recv or 0)

    # --- aggregate system ring ---
    cpus = [_telemetry[d].get("cpu", 0) for d in _telemetry if _telemetry[d].get("cpu") is not None]
    rams = [_telemetry[d].get("ram", 0) for d in _telemetry if _telemetry[d].get("ram") is not None]
    disks = [_telemetry[d].get("disk", 0) for d in _telemetry if _telemetry[d].get("disk") is not None]
    _system_ring.append({
        "ts": now,
        "cpu": round(sum(cpus) / len(cpus), 1) if cpus else 0,
        "ram": round(sum(rams) / len(rams), 1) if rams else 0,
        "disk": round(sum(disks) / len(disks), 1) if disks else 0,
        "online": sum(1 for d in _devices.values() if d.get("status") == "online"),
        "total": len(_devices),
    })

    # security score/threat ring (cheap, every ~10s)
    if not _threat_ring or now - _threat_ring[-1]["ts"] > 10:
        sc = compute_security_score()
        _threat_ring.append({"ts": now, "score": sc["score"], "level": sc["threat"]["level"]})

    _snapshot_daily_stats()


def _snapshot_daily_stats():
    """Persist one row/day so 'vs yesterday' comparisons work."""
    global _last_daily_snapshot
    now = time.time()
    if now - _last_daily_snapshot < 60:
        return
    _last_daily_snapshot = now
    today = datetime.now().strftime("%Y-%m-%d")
    alerts = _count_alerts_since(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0))
    avg_bw = _avg_bandwidth()
    score = compute_security_score()["score"]
    try:
        conn = _db()
        conn.execute("""
            INSERT INTO daily_stats (date, alerts, bandwidth, score, avg_cpu)
            VALUES (?,?,?,?,?)
            ON CONFLICT(date) DO UPDATE SET
                alerts=excluded.alerts, bandwidth=excluded.bandwidth,
                score=excluded.score, avg_cpu=excluded.avg_cpu
        """, (today, alerts, avg_bw, score, _avg_cpu()))
        conn.commit()
        conn.close()
    except Exception:
        pass


def _count_alerts_since(dt):
    try:
        conn = _db()
        n = conn.execute("SELECT COUNT(*) c FROM alerts WHERE timestamp >= ?", (dt.isoformat(),)).fetchone()["c"]
        conn.close()
        return n
    except Exception:
        return 0


def _avg_bandwidth():
    if not _traffic_history:
        return 0.0
    return round(sum(e["dl"] + e["ul"] for e in _traffic_history) / len(_traffic_history), 1)


def _avg_cpu():
    if not _system_ring:
        return 0.0
    return round(sum(e["cpu"] for e in _system_ring) / len(_system_ring), 1)


# ============================================================
# SECURITY SCORE (0-100)
# ============================================================
def compute_security_score():
    factors = []
    score = 0.0
    online = [d for d in _devices.values() if d.get("status") == "online"]

    # firewall (telemetry, else pending)
    fw = [t.get("firewall") for t in _telemetry.values()]
    fw_enabled = any(x is True for x in fw)
    fw_disabled = any(x is False for x in fw)
    if fw_enabled:
        score += 20; factors.append({"label": "Firewall Active", "impact": 20, "applied": True})
    elif fw_disabled:
        score -= 25; factors.append({"label": "Firewall Disabled", "impact": -25, "applied": True})
    else:
        factors.append({"label": "Firewall telemetry pending", "impact": 0, "applied": False})

    # antivirus / malware
    av = [t.get("antivirus") for t in _telemetry.values()]
    malware = any(t.get("malware_detected") for t in _telemetry.values())
    if any(x is True for x in av):
        score += 20; factors.append({"label": "Antivirus Active", "impact": 20, "applied": True})
    elif any(x is False for x in av):
        score += 0; factors.append({"label": "Antivirus missing on a node", "impact": 0, "applied": True})
    else:
        factors.append({"label": "Antivirus telemetry pending", "impact": 0, "applied": False})
    if malware:
        score -= 40; factors.append({"label": "Malware detected", "impact": -40, "applied": True})

    # critical alerts
    crit = _count_alerts_by_severity("critical")
    if crit == 0:
        score += 20; factors.append({"label": "No critical alerts", "impact": 20, "applied": True})
    else:
        score -= 30 * min(crit, 2)
        factors.append({"label": f"{crit} critical alert(s)", "impact": -30 * min(crit, 2), "applied": True})

    # CPU load
    high_cpu = any(t.get("cpu", 0) > 85 for t in _telemetry.values())
    low_cpu = all(t.get("cpu", 0) < 60 for t in _telemetry.values()) if _telemetry else False
    if low_cpu:
        score += 10; factors.append({"label": "Healthy CPU load", "impact": 10, "applied": True})
    if high_cpu:
        score -= 10; factors.append({"label": "High CPU on a node", "impact": -10, "applied": True})

    # dangerous ports
    open_ports = set()
    for t in _telemetry.values():
        open_ports.update(t.get("open_ports", []) or [])
    danger = [p for p in open_ports if p in DANGEROUS_PORTS]
    if not danger:
        score += 5; factors.append({"label": "No dangerous open ports", "impact": 5, "applied": True})
    else:
        score -= 5 * len(danger)
        factors.append({"label": f"Dangerous ports open: {danger}", "impact": -5 * len(danger), "applied": True})

    # failed logins (last 24h)
    fails = _count_failed_logins(24)
    if fails:
        penalty = min(fails, 5) * 5
        score -= penalty
        factors.append({"label": f"{fails} failed login(s) in 24h", "impact": -penalty, "applied": True})

    # disk encryption
    if any(t.get("encrypted_disk") for t in _telemetry.values()):
        score += 10; factors.append({"label": "Encrypted disk", "impact": 10, "applied": True})

    # critical CVE (from client CVE scan, default none)
    cves = sum(len(t.get("critical_cves", []) or []) for t in _telemetry.values())
    if cves:
        score -= 30 * cves
        factors.append({"label": f"{cves} critical CVE(s)", "impact": -30 * cves, "applied": True})

    # offline nodes
    offline = len(_devices) - len(online)
    if offline:
        score -= 5 * offline
        factors.append({"label": f"{offline} node(s) offline", "impact": -5 * offline, "applied": True})

    score = max(0, min(100, round(score, 1)))
    status = "Excellent" if score >= 85 else "Good" if score >= 70 else "Fair" if score >= 50 else "Poor" if score >= 30 else "Critical"
    threat_value = round(100 - score, 1)
    level = next(band[2] for band in THREAT_BANDS if band[0] <= threat_value < band[1])
    return {
        "score": score,
        "status": status,
        "factors": factors,
        "threat": {"value": threat_value, "level": level},
        "computed_at": datetime.now().isoformat(),
    }


# ============================================================
# DEVICE RISK (0-100, explainable factors[])
# ============================================================
def compute_device_risk(device_id):
    dev = _devices.get(device_id, {})
    t = _telemetry.get(device_id, {})
    factors = []
    risk = 0.0

    ports = t.get("open_ports", []) or []
    dangerous = [p for p in ports if p in DANGEROUS_PORTS]
    if dangerous:
        risk += 25
        factors.append({"label": f"Open dangerous ports: {dangerous}", "impact": 25})
    elif ports:
        risk += min(len(ports) * 2, 10)
        factors.append({"label": f"{len(ports)} open port(s)", "impact": min(len(ports) * 2, 10)})
    else:
        factors.append({"label": "No open ports detected", "impact": 0})

    if t.get("firewall") is False:
        risk += 25; factors.append({"label": "Firewall disabled", "impact": 25})

    if t.get("malware_detected"):
        risk += 40; factors.append({"label": "Malware detected", "impact": 40})

    if t.get("suspicious_processes"):
        risk += 15; factors.append({"label": "Suspicious processes", "impact": 15})

    cpu = t.get("cpu", 0) or 0
    if cpu > 90:
        risk += 15; factors.append({"label": f"CPU abuse ({cpu}%)", "impact": 15})
    elif cpu > 75:
        risk += 8; factors.append({"label": f"High CPU ({cpu}%)", "impact": 8})

    fails = _count_failed_logins(24, device_id)
    if fails:
        add = min(fails * 5, 20)
        risk += add; factors.append({"label": f"{fails} failed login(s)", "impact": add})

    os_name = (dev.get("os", "") + " " + dev.get("os_version", "")).lower()
    if any(x in os_name for x in ["xp", "vista", "7 ", "server 2003", "server 2008"]):
        risk += 10; factors.append({"label": "End-of-life operating system", "impact": 10})

    if dev.get("status") != "online":
        risk += 10; factors.append({"label": "Node offline (no telemetry)", "impact": 10})

    if not t:
        risk += 5; factors.append({"label": "No security telemetry received", "impact": 5})

    risk = max(0, min(100, round(risk, 1)))
    level = next(band[2] for band in THREAT_BANDS if band[0] <= risk < band[1]) if risk < 100 else "CRITICAL"
    return {
        "device_id": device_id,
        "hostname": dev.get("hostname", device_id[:8]),
        "ip": dev.get("ip", "0.0.0.0"),
        "os": dev.get("os", "Unknown"),
        "status": dev.get("status", "offline"),
        "risk": risk,
        "level": level,
        "factors": factors,
    }


def compute_risk_ranking():
    ranking = [compute_device_risk(d) for d in _devices]
    ranking.sort(key=lambda r: r["risk"], reverse=True)
    return ranking


# ============================================================
# NETWORK TRAFFIC
# ============================================================
def compute_traffic():
    hist = list(_traffic_history)
    if not hist:
        return {
            "download": 0, "upload": 0, "avg_download": 0, "avg_upload": 0,
            "peak": 0, "most_active_device": None, "top_consumer": None,
            "total_bytes": 0, "sample_count": 0,
        }
    last = hist[-1]
    dl = round(last["dl"], 1)
    ul = round(last["ul"], 1)
    avg_dl = round(sum(e["dl"] for e in hist) / len(hist), 1)
    avg_ul = round(sum(e["ul"] for e in hist) / len(hist), 1)
    peak = round(max(e["dl"] + e["ul"] for e in hist), 1)
    by_dev = defaultdict(float)
    for e in hist:
        by_dev[e["active_dev"]] += e["active_bytes"]
    top_dev = max(by_dev, key=by_dev.get) if by_dev else None
    top_name = _devices.get(top_dev, {}).get("hostname", top_dev) if top_dev else None
    return {
        "download": dl, "upload": ul,
        "avg_download": avg_dl, "avg_upload": avg_ul,
        "peak": peak,
        "most_active_device": {"id": top_dev, "hostname": top_name} if top_dev else None,
        "top_consumer": {"id": top_dev, "hostname": top_name, "bytes": round(by_dev[top_dev])} if top_dev else None,
        "total_bytes": round(sum(e["active_bytes"] for e in hist)),
        "sample_count": len(hist),
    }


# ============================================================
# PROTOCOL STATISTICS (estimated baseline, swappable)
# ============================================================
def compute_protocols():
    traffic = compute_traffic()
    total_mb = traffic["total_bytes"] / (1024 * 1024) if traffic["total_bytes"] else 4096.0
    total_mb = max(total_mb, 512.0)  # floor so percentages stay sane
    out = []
    for p in PROTOCOL_BASELINE:
        out.append({
            "name": p["name"],
            "percent": p["percent"],
            "packets": p["packets"],
            "volume_mb": round(p["percent"] / 100.0 * total_mb, 1),
            "source": "estimated",
        })
    out.sort(key=lambda x: x["percent"], reverse=True)
    return out


# ============================================================
# AUTHENTICATION MONITOR
# ============================================================
def record_auth(username, success, ip, remote=False, source="web"):
    """Called from app.py login route. Persists + brute-force detection."""
    conn = _db()
    conn.execute(
        "INSERT INTO auth_attempts (username, success, ip, remote, source, timestamp) VALUES (?,?,?,?,?,?)",
        (username, 1 if success else 0, ip or "", 1 if remote else 0, source, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

    # lockout: 5 consecutive failures for a username -> locked 5 minutes
    if not success:
        count, locked_until = _auth_lockout.get(username, (0, 0))
        count += 1
        if count >= 5 and locked_until < time.time():
            _auth_lockout[username] = (0, time.time() + 300)
            add_alert(None, "critical", "Account lockout",
                      f"Account '{username}' locked for 5 minutes after {count} failed attempts", "authentication", "open")
        else:
            _auth_lockout[username] = (count, locked_until)
    else:
        _auth_lockout.pop(username, None)

    # brute force: >=5 failures from same IP in 10 min
    now = time.time()
    _brute_track.setdefault(ip, []).append((now, success))
    _brute_track[ip] = [(ts, s) for ts, s in _brute_track[ip] if now - ts < 600]
    fails = sum(1 for _, s in _brute_track[ip] if not s)
    if fails >= 5:
        add_alert(None, "high", "Brute force detected",
                  f"{fails} failed logins from {ip} within 10 minutes", "authentication", "open")
        push("auth", compute_auth_monitor())


def is_locked(username):
    count, locked_until = _auth_lockout.get(username, (0, 0))
    return locked_until > time.time()


def compute_auth_monitor():
    conn = _db()
    today = datetime.now().strftime("%Y-%m-%d")
    success_today = conn.execute(
        "SELECT COUNT(*) c FROM auth_attempts WHERE success=1 AND timestamp LIKE ?", (today + "%",)
    ).fetchone()["c"]
    fail_today = conn.execute(
        "SELECT COUNT(*) c FROM auth_attempts WHERE success=0 AND timestamp LIKE ?", (today + "%",)
    ).fetchone()["c"]
    recent = conn.execute(
        "SELECT * FROM auth_attempts ORDER BY id DESC LIMIT 25"
    ).fetchall()
    conn.close()

    brute_ips = [ip for ip, ev in _brute_track.items() if sum(1 for _, s in ev if not s) >= 5]
    return {
        "success_today": success_today,
        "failed_today": fail_today,
        "brute_force_attempts": len(brute_ips),
        "brute_force_ips": brute_ips,
        "locked_accounts": [u for u, (c, until) in _auth_lockout.items() if until > time.time()],
        "remote_logins": sum(1 for r in recent if r["remote"]),
        "unknown_users": sum(1 for r in recent if r["username"] not in ("admin", "")),
        "recent": [dict(r) for r in recent],
    }


def _count_failed_logins(hours, device_id=None):
    try:
        conn = _db()
        since = (datetime.now() - timedelta(hours=hours)).isoformat()
        if device_id:
            n = conn.execute(
                "SELECT COUNT(*) c FROM auth_attempts WHERE success=0 AND timestamp >= ? AND ip=?",
                (since, device_id)
            ).fetchone()["c"]
        else:
            n = conn.execute(
                "SELECT COUNT(*) c FROM auth_attempts WHERE success=0 AND timestamp >= ?", (since,)
            ).fetchone()["c"]
        conn.close()
        return n
    except Exception:
        return 0


# ============================================================
# ALERT CENTER
# ============================================================
def add_alert(device_id, severity, title, description, category="system", status="open"):
    conn = _db()
    conn.execute(
        """INSERT INTO alerts (device_id, type, severity, title, category, status, message, timestamp)
           VALUES (?,?,?,?,?,?,?,?)""",
        (device_id or "", severity, severity, title, category, status, description, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    if _socketio is not None:
        try:
            _socketio.emit('new_alert', {
                "device_id": device_id, "severity": severity,
                "title": title, "description": description,
                "category": category, "timestamp": datetime.now().isoformat(),
            })
        except Exception:
            pass
    push("alerts", get_alert_center(limit=10))


def get_alert_center(limit=50, severity=None, category=None, status=None, device_id=None):
    conn = _db()
    q = ("SELECT a.*, d.hostname FROM alerts a "
         "LEFT JOIN devices d ON d.id = a.device_id WHERE 1=1")
    args = []
    if severity:
        q += " AND a.severity=?"; args.append(severity)
    if category:
        q += " AND a.category=?"; args.append(category)
    if status:
        q += " AND a.status=?"; args.append(status)
    if device_id:
        q += " AND a.device_id=?"; args.append(device_id)
    q += " ORDER BY a.id DESC LIMIT ?"; args.append(limit)
    rows = conn.execute(q, args).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _count_alerts_by_severity(severity):
    try:
        conn = _db()
        n = conn.execute("SELECT COUNT(*) c FROM alerts WHERE severity=?", (severity,)).fetchone()["c"]
        conn.close()
        return n
    except Exception:
        return 0


# ============================================================
# SYSTEM HEALTH (8 services)
# ============================================================
def _check_internet():
    global _last_internet_check, _internet_cache
    now = time.time()
    if now - _last_internet_check < 15 and _internet_cache is not None:
        return _internet_cache
    try:
        s = socket.create_connection(("8.8.8.8", 53), timeout=2)
        s.close()
        _internet_cache = True
    except Exception:
        _internet_cache = False
    _last_internet_check = now
    return _internet_cache


def compute_system_health():
    now = time.time()
    health = []

    # 1. Database
    try:
        conn = _db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        health.append({"name": "Database", "status": "healthy", "detail": "SQLite responding"})
    except Exception as e:
        health.append({"name": "Database", "status": "offline", "detail": str(e)[:60]})

    # 2. Socket.IO
    sid_count = len(_socketio.server.eio.sockets) if _socketio is not None else 0
    health.append({"name": "Socket.IO", "status": "healthy" if sid_count > 0 else "warning",
                   "detail": f"{sid_count} live connection(s)"})

    # 3. API
    age = now - _last_api_call
    health.append({"name": "API", "status": "healthy" if age < 60 else "warning",
                   "detail": f"last call {int(age)}s ago"})

    # 4. Backend process
    health.append({"name": "Backend", "status": "healthy", "detail": f"v{VERSION} running"})

    # 5. Frontend
    age = now - _last_frontend_ping
    health.append({"name": "Frontend", "status": "healthy" if age < 120 else "warning",
                   "detail": f"last poll {int(age)}s ago"})

    # 6. Internet
    ok = _check_internet()
    health.append({"name": "Internet", "status": "healthy" if ok else "offline", "detail": "8.8.8.8:53 reachable" if ok else "no route"})

    # 7. Monitoring thread
    health.append({"name": "Monitoring", "status": "healthy" if _monitor_alive else "offline",
                   "detail": "cleanup loop running" if _monitor_alive else "thread stopped"})

    # 8. Heartbeat
    age = now - _last_heartbeat
    health.append({"name": "Heartbeat", "status": "healthy" if age < 30 else "warning",
                   "detail": f"last beat {int(age)}s ago"})

    return health


def compute_server_health():
    """Server-side CPU/RAM/disk/DB/API/WebSocket/storage."""
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(_db_path or '/')
        net = psutil.net_io_counters()
        db_size = os.path.getsize(_db_path) if _db_path and os.path.exists(_db_path) else 0
        return {
            "cpu": cpu,
            "memory": {"percent": mem.percent, "total": mem.total, "available": mem.available},
            "disk": {"percent": disk.percent, "total": disk.total, "used": disk.used, "free": disk.free},
            "network": {"bytes_sent": net.bytes_sent, "bytes_recv": net.bytes_recv},
            "database_size": db_size,
            "uptime": time.time() - psutil.boot_time(),
        }
    except ImportError:
        return {"cpu": 0, "memory": {"percent": 0, "total": 0, "available": 0},
                "disk": {"percent": 0, "total": 0, "used": 0, "free": 0},
                "database_size": 0, "uptime": time.time() - _start_time}


# ============================================================
# CHARTS / TRENDS / GEO / FOOTER
# ============================================================
def compute_charts():
    labels = [datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S") for e in list(_system_ring)[-60:]]
    return {
        "cpu": {"labels": labels, "values": [e["cpu"] for e in list(_system_ring)[-60:]]},
        "ram": {"labels": labels, "values": [e["ram"] for e in list(_system_ring)[-60:]]},
        "disk": {"labels": labels, "values": [e["disk"] for e in list(_system_ring)[-60:]]},
        "traffic": {
            "labels": [datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S") for e in list(_traffic_history)[-60:]],
            "download": [e["dl"] for e in list(_traffic_history)[-60:]],
            "upload": [e["ul"] for e in list(_traffic_history)[-60:]],
        },
        "threat": {
            "labels": [datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S") for e in list(_threat_ring)[-60:]],
            "values": [e["score"] for e in list(_threat_ring)[-60:]],
        },
        "device_growth": _device_growth(),
        "alert_trend": _alert_trend(),
        "online_trend": {
            "labels": [datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S") for e in list(_system_ring)[-60:]],
            "online": [e["online"] for e in list(_system_ring)[-60:]],
            "offline": [e["total"] - e["online"] for e in list(_system_ring)[-60:]],
        },
    }


def _device_growth():
    conn = _db()
    rows = conn.execute(
        "SELECT substr(registered_at,1,10) d, COUNT(*) c FROM devices WHERE registered_at != '' GROUP BY d ORDER BY d DESC LIMIT 7"
    ).fetchall()
    conn.close()
    labels = [r["d"] for r in reversed(rows)]
    values = [r["c"] for r in reversed(rows)]
    return {"labels": labels, "values": values}


def _alert_trend():
    conn = _db()
    rows = conn.execute(
        "SELECT substr(timestamp,12,5) h, severity, COUNT(*) c FROM alerts "
        "WHERE timestamp >= ? GROUP BY h, severity ORDER BY h",
        ((datetime.now() - timedelta(hours=24)).isoformat(),)
    ).fetchall()
    conn.close()
    buckets = defaultdict(lambda: {"critical": 0, "high": 0, "medium": 0, "low": 0})
    for r in rows:
        buckets[r["h"]][r["severity"] or "low"] = r["c"]
    labels = sorted(buckets.keys())
    return {
        "labels": labels,
        "critical": [buckets[h]["critical"] for h in labels],
        "high": [buckets[h]["high"] for h in labels],
        "medium": [buckets[h]["medium"] for h in labels],
        "low": [buckets[h]["low"] for h in labels],
    }


def compute_trends():
    today = datetime.now().strftime("%Y-%m-%d")
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        conn = _db()
        t = conn.execute("SELECT * FROM daily_stats WHERE date=?", (today,)).fetchone()
        y = conn.execute("SELECT * FROM daily_stats WHERE date=?", (yesterday,)).fetchone()
        conn.close()
    except Exception:
        t = y = None
    t = dict(t) if t else {}
    y = dict(y) if y else {}

    def delta(cur, prev):
        if cur is None or prev is None or prev == 0:
            return None
        return round((cur - prev) / prev * 100, 1)

    score = delta(t.get("score"), y.get("score"))
    alerts = delta(t.get("alerts"), y.get("alerts"))
    bandwidth = delta(t.get("bandwidth"), y.get("bandwidth"))
    threats = -alerts if alerts is not None else None
    return {
        "threats": threats,          # negative = improved
        "bandwidth": bandwidth,      # positive = more traffic
        "score": score,              # positive = better
        "alerts": alerts,            # negative = improved
        "has_comparison": bool(t and y),
    }


def compute_geo():
    by_country = defaultdict(int)
    locations = []
    for d in _devices.values():
        c = d.get("country", "Unknown")
        by_country[c] += 1
        if d.get("latitude") and d.get("longitude"):
            locations.append({
                "hostname": d.get("hostname"), "country": c, "city": d.get("city"),
                "lat": d["latitude"], "lon": d["longitude"], "status": d.get("status"),
            })
    return {"by_country": dict(by_country), "locations": locations}


def compute_footer(user="admin"):
    db_size = os.path.getsize(_db_path) if _db_path and os.path.exists(_db_path) else 0
    return {
        "uptime": round(time.time() - _start_time, 1),
        "database_size": db_size,
        "version": DASHBOARD_VERSION,
        "user": user,
        "server_time": datetime.now().isoformat(),
        "last_sync": datetime.fromtimestamp(_last_heartbeat).isoformat() if _last_heartbeat else "",
    }


def compute_live_stats():
    online = sum(1 for d in _devices.values() if d.get("status") == "online")
    total = len(_devices)
    alerts = _count_alerts_by_severity("critical") + _count_alerts_by_severity("high")
    return {
        "online": online, "offline": total - online, "total": total,
        "critical_alerts": _count_alerts_by_severity("critical"),
        "high_alerts": _count_alerts_by_severity("high"),
        "open_alerts": alerts,
        "packets_captured": sum(p["packets"] for p in PROTOCOL_BASELINE),
        "events_today": _count_alerts_since(datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)),
    }


# ============================================================
# AGGREGATED PAYLOAD — single GET /api/dashboard source
# ============================================================
def build_dashboard_payload():
    devices_list = []
    for dev_id, dev in _devices.items():
        risk = compute_device_risk(dev_id)
        devices_list.append({
            "id": dev_id,
            "hostname": dev.get("hostname", "Unknown"),
            "ip": dev.get("ip", "0.0.0.0"),
            "os": dev.get("os", "Unknown"),
            "os_version": dev.get("os_version", ""),
            "cpu": dev.get("cpu", "Unknown"),
            "ram": dev.get("ram", "Unknown"),
            "status": dev.get("status", "offline"),
            "last_seen": dev.get("last_seen", ""),
            "registered_at": dev.get("registered_at", ""),
            "country": dev.get("country", "Unknown"),
            "city": dev.get("city", "Unknown"),
            "public_ip": dev.get("public_ip", ""),
            "mac": dev.get("mac", ""),
            "risk": risk["risk"],
            "risk_level": risk["level"],
            "risk_factors": risk["factors"],
            "telemetry": _telemetry.get(dev_id, {}),
        })
    devices_list.sort(key=lambda x: (0 if x["status"] == "online" else 1, x["risk"]), reverse=False)
    security = compute_security_score()
    return {
        "server_time": datetime.now().isoformat(),
        "version": DASHBOARD_VERSION,
        "devices": {
            "total": len(_devices),
            "online": sum(1 for d in _devices.values() if d.get("status") == "online"),
            "offline": sum(1 for d in _devices.values() if d.get("status") != "online"),
            "list": devices_list,
        },
        "security": security,
        "alerts": {
            "critical": _count_alerts_by_severity("critical"),
            "high": _count_alerts_by_severity("high"),
            "medium": _count_alerts_by_severity("medium"),
            "low": _count_alerts_by_severity("low"),
            "total": _count_alerts_since(datetime.now() - timedelta(days=7)),
            "recent": get_alert_center(limit=10),
        },
        "traffic": compute_traffic(),
        "protocols": compute_protocols(),
        "risk_ranking": compute_risk_ranking(),
        "auth": compute_auth_monitor(),
        "health": compute_system_health(),
        "server_health": compute_server_health(),
        "charts": compute_charts(),
        "trends": compute_trends(),
        "geo": compute_geo(),
        "footer": compute_footer(),
        "live": compute_live_stats(),
    }