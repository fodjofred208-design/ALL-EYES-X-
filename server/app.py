#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║          ALL EYES X — Neural Cyber Intelligence              ║
║                    Flask Server v3.3                         ║
║                                                              ║
║  ENHANCEMENTS:                                               ║
║    10. New DB tables: os_info, hardware_info, processor_info, ║
║        memory_info, gpu_info, storage_devices,               ║
║        network_interfaces, peripherals, device_preferences   ║
║    11. Device detail endpoint with full hardware breakdown   ║
║    12. Device removal with cascade delete                    ║
║    13. Per-device preference storage (delete confirmation)   ║
║    14. Hardware inventory update endpoint for client agents  ║
╚══════════════════════════════════════════════════════════════╝
"""
import eventlet
eventlet.monkey_patch()
import os
import sys
import json
import uuid
import time
import hashlib
import hmac
import logging
import threading
import base64
import subprocess
import socket
import platform
import shutil
import sqlite3
import ipaddress
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "aeyes_data.db")
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from collections import defaultdict, deque
from flask import (
    Flask, render_template, request, jsonify, session,
    redirect, url_for, send_file, Response, send_from_directory
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ============================================================
# CONFIGURATION
# ============================================================

SECRET_KEY = os.environ.get("SECRET_KEY", "aeyes_x_s3cr3t_k3y_2026")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "FRED123")
AUTH_LOCK_THRESHOLD = int(os.environ.get("AUTH_LOCK_THRESHOLD", "5"))
AUTH_LOCK_WINDOW_MINUTES = int(os.environ.get("AUTH_LOCK_WINDOW_MINUTES", "15"))
AUTH_RECOVERY_UNLOCK_MINUTES = int(os.environ.get("AUTH_RECOVERY_UNLOCK_MINUTES", "60"))
# Configurable recovery phrase. Production should set RECOVERY_PHRASE_HASH to a
# SHA-256 hex digest and avoid relying on the development default.
RECOVERY_PHRASE_HASH = os.environ.get(
    "RECOVERY_PHRASE_HASH",
    hashlib.sha256(os.environ.get("RECOVERY_PHRASE", "KING FFF").encode("utf-8")).hexdigest(),
)

logging.basicConfig(
    level=os.environ.get("AEX_LOG_LEVEL", "INFO"),
    format="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("ALL-EYES-X")


# ============================================================
# QUIET SOCKET-ABORT NOISE
#
# Eventlet prints uncaught connection errors (client closed the socket early)
# straight to stderr as full tracebacks. On Windows these appear as:
#   ConnectionAbortedError: [WinError 10053] An established connection was
#   aborted by the software in your host machine
# They are harmless - the request already completed - but they drown the real
# activity log. This filter collapses each such traceback into ONE compact line
# and leaves every other traceback untouched.
# ============================================================
_QUIET_ERROR_MARKERS = (
    "ConnectionAbortedError",
    "ConnectionResetError",
    "BrokenPipeError",
    "WinError 10053",
    "WinError 10054",
    "WinError 10061",
)


class _QuietStderr:
    """Wrap sys.stderr and collapse known-harmless socket-abort tracebacks."""

    def __init__(self, stream):
        self._stream = stream
        self._block = None
        self._suppressed = 0

    def write(self, text):
        if not text:
            return len(text)
        for line in text.splitlines(True):
            stripped = line.strip()
            if stripped.startswith("Traceback (most recent call last):"):
                self._flush_block()
                self._block = [line]
                continue
            if self._block is not None:
                self._block.append(line)
                if stripped and not line.startswith((" ", "\t")) and not stripped.startswith("File "):
                    self._flush_block()
                continue
            self._stream.write(line)
        try:
            self._stream.flush()
        except Exception:
            pass
        return len(text)

    def _flush_block(self):
        if self._block is None:
            return
        joined = "".join(self._block)
        self._block = None
        if any(marker in joined for marker in _QUIET_ERROR_MARKERS):
            self._suppressed += 1
            summary = joined.strip().splitlines()[-1].strip()
            self._stream.write(
                f"[NET] client closed connection early - ignored ({summary}) "
                f"[suppressed tracebacks: {self._suppressed}]\n"
            )
            return
        self._stream.write(joined)

    def flush(self):
        try:
            self._stream.flush()
        except Exception:
            pass

    def isatty(self):
        try:
            return self._stream.isatty()
        except Exception:
            return False

    def __getattr__(self, name):
        return getattr(self._stream, name)


sys.stderr = _QuietStderr(sys.stderr)


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


app = Flask(__name__)

# ============================================================
# DATABASE PATH DIAGNOSTIC
# ============================================================

DATABASE_PATH = os.path.join(app.root_path, "aeyes_data.db")

print("=" * 60)
print("ALL EYES X DATABASE")
print("=" * 60)
print("APP ROOT     :", app.root_path)
print("DATABASE     :", DATABASE_PATH)
print("ABSOLUTE     :", os.path.abspath(DATABASE_PATH))
print("EXISTS       :", os.path.exists(DATABASE_PATH))
print("=" * 60)

app.config["SECRET_KEY"] = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 * 1024  # 2GB
app.config["UPLOAD_FOLDER"] = "transfers"

# ============================================================
# CORS CONFIGURATION
# ============================================================

CORS(
    app,
    resources={
        r"/*": {
            "origins": [
                "http://localhost:5173",
                "http://localhost:5000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5000",
                "http://100.104.145.118:5000",
                "https://meta-f.bittern-adelie.ts.net",
                "http://192.168.56.1:5000",
                "http://192.168.56.1:5173",
            ],
            "supports_credentials": True,
            "allow_headers": [
                "Content-Type",
                "Authorization",
                "X-Requested-With",
            ],
            "methods": [
                "GET",
                "POST",
                "PUT",
                "DELETE",
                "OPTIONS",
            ],
        }
    },
)

# ============================================================
# SOCKET.IO — FIXED: cors_allowed_origins="*" + max_http_buffer_size
# ============================================================

socketio = SocketIO(
    app,
    cors_allowed_origins='*',      # <--- THIS fixes the 500
    async_mode='eventlet',         # Already set presumably
    max_http_buffer_size=100 * 1024 * 1024,
    logger=False,
    engineio_logger=False
)
# ============================================================
# CREATE REQUIRED DIRECTORIES
# ============================================================

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs("static", exist_ok=True)

# ============================================================
# SQLITE PERSISTENCE  + dedupe_devices()
# ============================================================
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'aeyes_data.db')

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            hostname TEXT DEFAULT 'Unknown',
            ip TEXT DEFAULT '0.0.0.0',
            os_name TEXT DEFAULT 'Unknown',
            os_version TEXT DEFAULT '',
            cpu TEXT DEFAULT 'Unknown',
            ram TEXT DEFAULT 'Unknown',
            ram_total REAL DEFAULT 0,
            architecture TEXT DEFAULT '',
            mac TEXT DEFAULT '00:00:00:00:00:00',
            public_ip TEXT DEFAULT '',
            country TEXT DEFAULT 'Unknown',
            city TEXT DEFAULT 'Unknown',
            latitude REAL DEFAULT 0.0,
            longitude REAL DEFAULT 0.0,
            status TEXT DEFAULT 'offline',
            last_seen TEXT DEFAULT '',
            registered_at TEXT DEFAULT '',
            connected INTEGER DEFAULT 0,
            sessions INTEGER DEFAULT 0,
            data_usage TEXT DEFAULT '0 MB',
            deleted INTEGER DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            message TEXT DEFAULT '',
            timestamp TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id)
        );
        
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT DEFAULT 'info',
            message TEXT DEFAULT '',
            timestamp REAL DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS screenshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            image_data TEXT DEFAULT '',
            timestamp TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id)
        );
        
        CREATE TABLE IF NOT EXISTS webcam_frames (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            image_data TEXT DEFAULT '',
            timestamp TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id)
        );
        
        CREATE TABLE IF NOT EXISTS pending_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            task_type TEXT DEFAULT 'command',
            command TEXT DEFAULT '',
            created_at TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id)
        );

        CREATE TABLE IF NOT EXISTS device_preferences (
            device_id TEXT NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT DEFAULT '',
            updated_at TEXT DEFAULT '',
            PRIMARY KEY (device_id, preference_key),
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS os_info (
            device_id TEXT PRIMARY KEY,
            os_name TEXT DEFAULT '',
            os_version TEXT DEFAULT '',
            edition TEXT DEFAULT '',
            architecture TEXT DEFAULT '',
            language TEXT DEFAULT '',
            install_date TEXT DEFAULT '',
            boot_time TEXT DEFAULT '',
            kernel_version TEXT DEFAULT '',
            build_number TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS hardware_info (
            device_id TEXT PRIMARY KEY,
            manufacturer TEXT DEFAULT '',
            model TEXT DEFAULT '',
            motherboard TEXT DEFAULT '',
            bios_version TEXT DEFAULT '',
            bios_vendor TEXT DEFAULT '',
            serial_number TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS processor_info (
            device_id TEXT PRIMARY KEY,
            brand TEXT DEFAULT '',
            model TEXT DEFAULT '',
            core_count INTEGER DEFAULT 0,
            logical_threads INTEGER DEFAULT 0,
            clock_speed TEXT DEFAULT '',
            usage_percent REAL DEFAULT 0.0,
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS memory_info (
            device_id TEXT PRIMARY KEY,
            total_gb REAL DEFAULT 0,
            available_gb REAL DEFAULT 0,
            speed TEXT DEFAULT '',
            memory_type TEXT DEFAULT '',
            usage_percent REAL DEFAULT 0.0,
            slots_used INTEGER DEFAULT 0,
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS gpu_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            name TEXT DEFAULT '',
            manufacturer TEXT DEFAULT '',
            dedicated_memory TEXT DEFAULT '',
            driver_version TEXT DEFAULT '',
            current_usage REAL DEFAULT 0.0,
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS storage_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            name TEXT DEFAULT '',
            drive_type TEXT DEFAULT '',
            capacity TEXT DEFAULT '',
            used TEXT DEFAULT '',
            free TEXT DEFAULT '',
            health TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS network_interfaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            name TEXT DEFAULT '',
            interface_type TEXT DEFAULT '',
            ipv4 TEXT DEFAULT '',
            ipv6 TEXT DEFAULT '',
            mac TEXT DEFAULT '',
            gateway TEXT DEFAULT '',
            dns TEXT DEFAULT '',
            speed TEXT DEFAULT '',
            status TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS peripherals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            name TEXT DEFAULT '',
            manufacturer TEXT DEFAULT '',
            connection_type TEXT DEFAULT '',
            status TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS telemetry (
            device_id TEXT PRIMARY KEY,
            cpu REAL DEFAULT 0,
            ram REAL DEFAULT 0,
            disk REAL DEFAULT 0,
            net_sent REAL DEFAULT 0,
            net_recv REAL DEFAULT 0,
            firewall INTEGER DEFAULT -1,
            antivirus INTEGER DEFAULT -1,
            open_ports TEXT DEFAULT '[]',
            boot_time TEXT DEFAULT '',
            logged_user TEXT DEFAULT '',
            gpu TEXT DEFAULT '',
            wifi TEXT DEFAULT '',
            battery INTEGER DEFAULT -1,
            malware_detected INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT '',
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS traffic_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts REAL DEFAULT 0,
            device_id TEXT DEFAULT '',
            download REAL DEFAULT 0,
            upload REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS auth_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT DEFAULT '',
            success INTEGER DEFAULT 0,
            ip TEXT DEFAULT '',
            remote INTEGER DEFAULT 0,
            source TEXT DEFAULT 'web',
            timestamp TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT PRIMARY KEY,
            alerts INTEGER DEFAULT 0,
            bandwidth REAL DEFAULT 0,
            score REAL DEFAULT 0,
            avg_cpu REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS command_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_id TEXT DEFAULT '',
            device_id TEXT DEFAULT '',
            command TEXT DEFAULT '',
            result TEXT DEFAULT '',
            success INTEGER DEFAULT 0,
            requested_by TEXT DEFAULT '',
            queued_at TEXT DEFAULT '',
            completed_at TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS software_inventory (
            device_id TEXT PRIMARY KEY,
            installed_apps TEXT DEFAULT '[]',
            app_count INTEGER DEFAULT 0,
            user_files TEXT DEFAULT '[]',
            file_counts TEXT DEFAULT '{}',
            truncated INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS security_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT UNIQUE NOT NULL,
            device_id TEXT NOT NULL,
            scan_type TEXT NOT NULL,
            target TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            command TEXT DEFAULT '',
            result TEXT DEFAULT '',
            parsed_json TEXT DEFAULT '',
            requested_by TEXT DEFAULT '',
            queued_at TEXT DEFAULT '',
            started_at TEXT DEFAULT '',
            completed_at TEXT DEFAULT '',
            error TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS remote_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            device_id TEXT NOT NULL,
            started_by TEXT DEFAULT '',
            started_at TEXT DEFAULT '',
            ended_at TEXT DEFAULT '',
            mode TEXT DEFAULT 'control',
            notified INTEGER DEFAULT 0,
            note TEXT DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_remote_sessions_device ON remote_sessions(device_id);

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT '',
            actor TEXT DEFAULT '',
            device_id TEXT DEFAULT '',
            action TEXT DEFAULT '',
            result TEXT DEFAULT '',
            details TEXT DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
        CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
        CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
        CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device_id);
        CREATE INDEX IF NOT EXISTS idx_telemetry_updated ON telemetry(updated_at);
        CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_samples(ts);
        CREATE INDEX IF NOT EXISTS idx_auth_timestamp ON auth_attempts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_command_results_device ON command_results(device_id);
        CREATE INDEX IF NOT EXISTS idx_security_scans_device ON security_scans(device_id);
        CREATE INDEX IF NOT EXISTS idx_security_scans_status ON security_scans(status);
        CREATE INDEX IF NOT EXISTS idx_security_scans_target ON security_scans(target);
    """)

    def ensure_column(table, column, definition):
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    # Safe migrations for existing databases.
    ensure_column('devices', 'deleted', 'INTEGER DEFAULT 0')
    ensure_column('alerts', 'severity', "TEXT DEFAULT 'info'")
    ensure_column('alerts', 'title', "TEXT DEFAULT ''")
    ensure_column('alerts', 'category', "TEXT DEFAULT 'system'")
    ensure_column('alerts', 'status', "TEXT DEFAULT 'open'")
    ensure_column('notifications', 'title', "TEXT DEFAULT ''")
    ensure_column('notifications', 'status', "TEXT DEFAULT 'open'")
    ensure_column('auth_attempts', 'source', "TEXT DEFAULT 'web'")
    conn.commit()
    conn.close()
    print("[DB] Database initialized at", DB_PATH)


def dedupe_devices():
    """Merge duplicate device rows (same hostname + MAC) keeping the most recent."""
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT * FROM devices ORDER BY last_seen DESC, registered_at DESC"
        ).fetchall()
        seen = {}
        child_tables = [
            'device_preferences', 'os_info', 'hardware_info', 'processor_info',
            'memory_info', 'gpu_info', 'storage_devices', 'network_interfaces',
            'peripherals', 'alerts', 'screenshots', 'webcam_frames'
        ]
        for row in rows:
            mac = row['mac'] or ''
            key = (row['hostname'], mac)
            if mac and mac != '00:00:00:00:00:00' and key in seen:
                keep_id, drop_id = seen[key], row['id']
                for table in child_tables:
                    conn.execute("UPDATE OR IGNORE {} SET device_id=? WHERE device_id=?".format(table), (keep_id, drop_id))
                    conn.execute("DELETE FROM {} WHERE device_id=?".format(table), (drop_id,))
                conn.execute("DELETE FROM devices WHERE id=?", (drop_id,))
                print(f"[DB] Merged duplicate device {drop_id[:8]} -> {keep_id[:8]}")
            else:
                seen[key] = row['id']
        conn.commit()
        conn.close()
        print("[DB] Dedupe pass complete")
    except Exception as e:
        print(f"[DB] Dedupe skipped: {e}")

init_db()
dedupe_devices()

# ============================================================
# CENTRAL STATE SOURCE OF TRUTH
# ============================================================

def load_devices_from_db():
    conn = get_db()
    rows = conn.execute("SELECT * FROM devices WHERE deleted=0 ORDER BY status='online' DESC, last_seen DESC").fetchall()
    conn.close()
    result = {}
    for row in rows:
        result[row['id']] = dict(row)
    return result

def save_device_to_db(device_info):
    conn = get_db()
    existing = conn.execute("SELECT id FROM devices WHERE id=?", (device_info['id'],)).fetchone()
    if existing:
        conn.execute("""
            UPDATE devices SET
                hostname=?, ip=?, os_name=?, os_version=?, cpu=?,
                ram=?, ram_total=?, architecture=?, mac=?,
                public_ip=?, country=?, city=?, latitude=?,
                longitude=?, status=?, last_seen=?, deleted=0
            WHERE id=?
        """, (
            device_info.get('hostname', 'Unknown'),
            device_info.get('ip', '0.0.0.0'),
            device_info.get('os', 'Unknown'),
            device_info.get('os_version', ''),
            device_info.get('cpu', 'Unknown'),
            device_info.get('ram', 'Unknown'),
            device_info.get('ram_total', 0),
            device_info.get('architecture', ''),
            device_info.get('mac', '00:00:00:00:00:00'),
            device_info.get('public_ip', ''),
            device_info.get('country', 'Unknown'),
            device_info.get('city', 'Unknown'),
            device_info.get('latitude', 0.0),
            device_info.get('longitude', 0.0),
            device_info.get('status', 'online'),
            device_info.get('last_seen', datetime.now().isoformat()),
            device_info['id']
        ))
    else:
        conn.execute("""
            INSERT INTO devices (
                id, hostname, ip, os_name, os_version, cpu,
                ram, ram_total, architecture, mac, public_ip,
                country, city, latitude, longitude, status,
                last_seen, registered_at, connected
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
        """, (
            device_info.get('id'),
            device_info.get('hostname', 'Unknown'),
            device_info.get('ip', '0.0.0.0'),
            device_info.get('os', 'Unknown'),
            device_info.get('os_version', ''),
            device_info.get('cpu', 'Unknown'),
            device_info.get('ram', 'Unknown'),
            device_info.get('ram_total', 0),
            device_info.get('architecture', ''),
            device_info.get('mac', '00:00:00:00:00:00'),
            device_info.get('public_ip', ''),
            device_info.get('country', 'Unknown'),
            device_info.get('city', 'Unknown'),
            device_info.get('latitude', 0.0),
            device_info.get('longitude', 0.0),
            device_info.get('status', 'online'),
            device_info.get('last_seen', datetime.now().isoformat()),
            device_info.get('registered_at', datetime.now().isoformat()),
        ))
    conn.commit()
    conn.close()

def add_alert_to_db(device_id, alert_type, message, notify=True):
    conn = get_db()
    conn.execute(
        "INSERT INTO alerts (device_id, type, message, timestamp) VALUES (?,?,?,?)",
        (device_id, alert_type, message, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    # Every alert becomes a notification unless the caller already notified
    # about the same event (avoids duplicate entries in the bell).
    if notify:
        try:
            add_notification('alert', f'ALERT [{str(alert_type).upper()}] {message[:160]}')
        except Exception:
            pass

def get_alerts_from_db(device_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM alerts WHERE device_id=? ORDER BY timestamp DESC LIMIT 50",
        (device_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_notification(notif_type, message):
    conn = get_db()
    now = time.time()
    conn.execute(
        "INSERT INTO notifications (type, message, timestamp) VALUES (?,?,?)",
        (notif_type, message, now)
    )
    conn.execute("DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY id DESC LIMIT 200)")
    conn.commit()
    conn.close()
    socketio.emit('new_notification', {
        'type': notif_type,
        'message': message,
        'timestamp': now
    })

def get_notifications_from_db(limit=50):
    conn = get_db()
    rows = conn.execute("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows][::-1]

def get_device_preference(device_id, key, default=None):
    conn = get_db()
    row = conn.execute(
        "SELECT preference_value FROM device_preferences WHERE device_id=? AND preference_key=?",
        (device_id, key)
    ).fetchone()
    conn.close()
    if row:
        return row['preference_value']
    return default

def set_device_preference(device_id, key, value):
    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO device_preferences (device_id, preference_key, preference_value, updated_at)
        VALUES (?,?,?,?)
    """, (device_id, key, str(value), datetime.now().isoformat()))
    conn.commit()
    conn.close()


def audit_event(actor='', device_id='', action='', result='ok', details=''):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO audit_log (timestamp, actor, device_id, action, result, details) VALUES (?,?,?,?,?,?)",
            (datetime.now().isoformat(), actor or 'system', device_id or '', action, result, details[:4000])
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[AUDIT] failed: {e}")


def record_auth_attempt(username, success, ip, source='web'):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO auth_attempts (username, success, ip, remote, source, timestamp) VALUES (?,?,?,?,?,?)",
            (username or '', 1 if success else 0, ip or '', 0, source, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[AUTH] record failed: {e}")


def count_recent_failed_auth(username='', ip='', minutes=15):
    since = (datetime.now() - timedelta(minutes=minutes)).isoformat()
    conn = get_db()
    row = conn.execute(
        """
        SELECT COUNT(*) c FROM auth_attempts
        WHERE success=0 AND timestamp>=? AND (username=? OR ip=?)
        """,
        (since, username or '', ip or '')
    ).fetchone()
    conn.close()
    return int(row['c'] if row else 0)


def client_ip():
    return (request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip())


def recovery_phrase_valid(phrase):
    digest = hashlib.sha256((phrase or '').encode('utf-8')).hexdigest()
    return hmac.compare_digest(digest, RECOVERY_PHRASE_HASH)


TAILSCALE_NET = ipaddress.ip_network('100.64.0.0/10')
AUTHORIZED_PUBLIC_SCAN_TARGETS = [
    t.strip() for t in os.environ.get('AEX_AUTHORIZED_PUBLIC_SCAN_TARGETS', '').split(',') if t.strip()
]


def validate_scan_target(target):
    """Allow only private/Tailscale ranges unless explicitly configured.

    This prevents accidental scans of third-party public infrastructure.
    """
    try:
        net = ipaddress.ip_network((target or '').strip(), strict=False)
    except Exception:
        raise ValueError('Invalid scan target. Use an IP address or CIDR range.')

    if net.num_addresses > 4096:
        raise PermissionError('Scan range too large. Maximum allowed range is 4096 addresses.')

    authorized_public = False
    for item in AUTHORIZED_PUBLIC_SCAN_TARGETS:
        try:
            if net.subnet_of(ipaddress.ip_network(item, strict=False)):
                authorized_public = True
                break
        except Exception:
            continue

    if not (net.is_private or net.subnet_of(TAILSCALE_NET) or authorized_public):
        raise PermissionError('Only private, Tailscale, or explicitly authorized public targets are allowed.')

    return str(net)


# ============================================================
# ALERT EXPLANATION
#
# The Alert Center must show, for every alert: the device name, the alert
# type, the cause and a proposed fix. Cause/fix come from a deterministic
# mapping of the recorded event text - never invented telemetry.
# ============================================================
_ALERT_RULES = [
    ('firewall', 'Host firewall is disabled or unresponsive.',
     'Enable the host firewall and verify the default inbound policy blocks unsolicited traffic.'),
    ('antivirus', 'Endpoint protection is disabled or not reporting.',
     'Turn on real-time protection and confirm the AV service is running and updated.'),
    ('malware', 'Malware indicator reported by the agent.',
     'Isolate the device from the network, run a full AV scan, and review the flagged path.'),
    ('keylog', 'Keylogger diagnostic capture is active on this agent.',
     'Disable ALLEYESX_ENABLE_KEYLOG_DIAGNOSTIC unless an authorized session requires it.'),
    ('login', 'Authentication activity was recorded against the console.',
     'Verify the account and source IP; rotate credentials if the attempt was unexpected.'),
    ('recovery', 'A security-state recovery phrase attempt was made.',
     'Confirm the operator is authorized; review the audit log entry for source IP.'),
    ('nmap', 'An authorized port scan was executed against this target.',
     'Review open ports and close or firewall any service that is not required.'),
    ('port', 'Open ports were detected on this device.',
     'Close unused listeners and restrict required ones to trusted source ranges.'),
    ('offline', 'The agent stopped sending heartbeats.',
     'Check the device power/network state and confirm client.py is running.'),
    ('removed', 'The device was removed from the inventory.',
     'Re-register the agent if the removal was unintended.'),
    ('command', 'An administrative command was executed or returned an error.',
     'Review the command output in the Terminal evidence panel before repeating it.'),
    ('transfer', 'A file transfer was started or completed.',
     'Confirm the file, target device and checksum with the recipient.'),
    ('scan', 'A security scan was executed.',
     'Open the scan result and remediate every high-risk finding.'),
]


def explain_alert(text, category=''):
    """Return (cause, proposed_fix) for a recorded alert string."""
    haystack = f'{category} {text}'.lower()
    for needle, cause, fix in _ALERT_RULES:
        if needle in haystack:
            return cause, fix
    return (
        'Event recorded by the ALL EYES X monitoring pipeline.',
        'Inspect the related audit log entry and confirm whether action is required.',
    )


def activity(message, **fields):
    detail = ' '.join(f'{k}={v}' for k, v in fields.items() if v is not None)
    logger.info("%s%s", message, f" | {detail}" if detail else "")


def persist_telemetry(device_id, data):
    now_iso = datetime.now().isoformat()
    def bool_int(value):
        if value is True:
            return 1
        if value is False:
            return 0
        try:
            return int(value)
        except Exception:
            return -1

    open_ports = data.get('open_ports', [])
    if not isinstance(open_ports, str):
        open_ports = json.dumps(open_ports)

    battery_value = data.get('battery')
    if isinstance(battery_value, dict):
        battery_value = battery_value.get('percent', -1)
    try:
        battery_value = int(battery_value if battery_value is not None else -1)
    except Exception:
        battery_value = -1

    conn = get_db()
    conn.execute("""
        INSERT OR REPLACE INTO telemetry
        (device_id, cpu, ram, disk, net_sent, net_recv, firewall, antivirus,
         open_ports, boot_time, logged_user, gpu, wifi, battery, malware_detected, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        device_id,
        float(data.get('cpu') or 0),
        float(data.get('ram') or 0),
        float(data.get('disk') or 0),
        float(data.get('net_sent') or 0),
        float(data.get('net_recv') or 0),
        bool_int(data.get('firewall')),
        bool_int(data.get('antivirus')),
        open_ports,
        str(data.get('boot_time') or ''),
        str(data.get('logged_user') or ''),
        str(data.get('gpu') or ''),
        str(data.get('wifi') or ''),
        battery_value,
        1 if data.get('malware_detected') else 0,
        now_iso,
    ))
    conn.execute(
        "INSERT INTO traffic_samples (ts, device_id, download, upload) VALUES (?,?,?,?)",
        (time.time(), device_id, float(data.get('net_recv') or 0), float(data.get('net_sent') or 0))
    )
    conn.execute("DELETE FROM traffic_samples WHERE id NOT IN (SELECT id FROM traffic_samples ORDER BY id DESC LIMIT 5000)")
    conn.commit()
    conn.close()

# ============================================================
# In-memory cache
# ============================================================
connected_devices = load_devices_from_db()
connected_clients_sid = {}
pending_tasks_queue = {}
security_unlock_until = {}  # client_ip -> unix timestamp after successful recovery phrase
_offline_notified = {}      # device_id -> unix ts of last offline notification
# Do not re-notify the same offline device more than once per this many seconds.
OFFLINE_NOTIFY_COOLDOWN = int(os.environ.get('OFFLINE_NOTIFY_COOLDOWN', '900'))
touch_event_queues = defaultdict(list)
touch_event_counter = 0
latest_screenshots = {}
latest_webcam_frames = {}
# Per-frame metadata, kept in memory only (see note in api_screenshot).
latest_screenshot_meta = {}
latest_webcam_meta = {}
# Rolling frame counters used to report REAL server-measured stream rates.
_stream_frames = defaultdict(lambda: deque(maxlen=120))

# ============================================================
# AUTH DECORATOR
# ============================================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Unauthorized', 'message': 'Login required'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

# ============================================================
# ROUTES: AUTHENTICATION
# ============================================================
@app.route('/api/auth/login', methods=['POST'])
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            username = data.get('username', '')
            password = data.get('password', '')
        else:
            username = request.form.get('username', '')
            password = request.form.get('password', '')

        ip = client_ip()
        locked_attempts = count_recent_failed_auth(username, ip, minutes=AUTH_LOCK_WINDOW_MINUTES)
        unlocked = security_unlock_until.get(ip, 0) > time.time()
        if locked_attempts >= AUTH_LOCK_THRESHOLD and not unlocked:
            record_auth_attempt(username, False, ip)
            audit_event(username, '', 'login_blocked', 'locked', f'ip={ip}; attempts={locked_attempts}')
            activity('AUTH LOCKDOWN ACTIVE', username=username, ip=ip, attempts=locked_attempts)
            add_notification('security', f'LOCKDOWN: repeated failed logins from {ip} ({locked_attempts} attempts)')
            if request.is_json:
                return jsonify({
                    'success': False,
                    'locked': True,
                    'attempts': locked_attempts + 1,
                    'threshold': AUTH_LOCK_THRESHOLD,
                    'error': 'Security state active. Enter recovery phrase.'
                }), 423
            return render_template('login.html', error='Security state active')

        if username == ADMIN_USER and password == ADMIN_PASS:
            session['user'] = username
            session['login_time'] = datetime.now().isoformat()
            record_auth_attempt(username, True, ip)
            audit_event(username, '', 'login', 'success', f'ip={ip}')
            activity('AUTH SUCCESS', username=username, ip=ip)
            add_notification('auth', f'LOGIN SUCCESS: {username} from {ip}')
            if request.is_json:
                return jsonify({'success': True, 'redirect': url_for('loading')})
            return redirect(url_for('loading'))

        record_auth_attempt(username, False, ip)
        attempts = count_recent_failed_auth(username, ip, minutes=AUTH_LOCK_WINDOW_MINUTES)
        audit_event(username, '', 'login', 'failed', f'ip={ip}; attempts={attempts}')
        activity('AUTH FAILED', username=username, ip=ip, attempts=attempts)
        add_notification('auth', f'LOGIN FAILED: {username} from {ip} (attempt {attempts})')
        if request.is_json:
            message = 'Invalid credentials'
            if attempts >= 3:
                message = 'Invalid credentials. Repeated failures will trigger security state.'
            return jsonify({
                'success': False,
                'attempts': attempts,
                'threshold': AUTH_LOCK_THRESHOLD,
                'locked': attempts >= AUTH_LOCK_THRESHOLD,
                'error': message
            }), 401
        return render_template('login.html', error='Invalid credentials')

    return render_template('login.html')


@app.route('/api/auth/recover', methods=['POST'])
def api_auth_recover():
    try:
        data = request.get_json(force=True)
        phrase = data.get('phrase', '')
        ip = client_ip()
        if recovery_phrase_valid(phrase):
            security_unlock_until[ip] = time.time() + (AUTH_RECOVERY_UNLOCK_MINUTES * 60)
            record_auth_attempt('recovery', True, ip, source='recovery')
            audit_event('recovery', '', 'security_recovery', 'success', f'ip={ip}')
            activity('SECURITY RECOVERY SUCCESS', ip=ip)
            add_notification('security', f'RECOVERY: security state cleared from {ip}')
            return jsonify({'success': True, 'message': 'Security state cleared'}), 200
        record_auth_attempt('recovery', False, ip, source='recovery')
        audit_event('recovery', '', 'security_recovery', 'failed', f'ip={ip}')
        activity('SECURITY RECOVERY FAILED', ip=ip)
        add_notification('security', f'RECOVERY FAILED: invalid phrase from {ip}')
        return jsonify({'success': False, 'error': 'Invalid recovery phrase'}), 401
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/auth/status', methods=['GET'])
def api_auth_status():
    ip = client_ip()
    attempts = count_recent_failed_auth('', ip, minutes=AUTH_LOCK_WINDOW_MINUTES)
    return jsonify({
        'authenticated': 'user' in session,
        'attempts': attempts,
        'threshold': AUTH_LOCK_THRESHOLD,
        'locked': attempts >= AUTH_LOCK_THRESHOLD and security_unlock_until.get(ip, 0) <= time.time(),
        'unlock_until': security_unlock_until.get(ip, 0),
    }), 200


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ============================================================
# ROUTES: PAGES
# ============================================================
@app.route('/')
@login_required
def index():
    return redirect(url_for('loading'))

@app.route('/loading')
@login_required
def loading():
    return render_template('loading.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/analytics')
@login_required
def analytics():
    return render_template('analytics.html')

@app.route('/devices')
@login_required
def devices():
    return render_template('devices.html')

@app.route('/live_monitor')
@login_required
def live_monitor():
    return render_template('live_monitor.html')

@app.route('/terminal')
@login_required
def terminal():
    return render_template('terminal.html')

@app.route('/webcam')
@login_required
def webcam():
    return render_template('webcam.html')

@app.route('/touch_monitor')
@login_required
def touch_monitor():
    return render_template('touch_monitor.html')

@app.route('/p2p_share')
@login_required
def p2p_share():
    return render_template('p2p_share.html')

@app.route('/security')
@login_required
def security():
    return render_template('security.html')


# ============================================================
# FIX #2: DEVICE ID CONSISTENCY
# ============================================================
@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json(force=True)
        device_id = data.get('device_id', '')
        
        if not device_id:
            mac = data.get('mac', '')
            ip = data.get('ip', request.remote_addr)
            
            conn = get_db()
            if mac and mac != '00:00:00:00:00:00':
                row = conn.execute("SELECT id FROM devices WHERE mac=?", (mac,)).fetchone()
            else:
                row = conn.execute("SELECT id FROM devices WHERE ip=?", (ip,)).fetchone()
            
            if row:
                device_id = row['id']
                print(f"[+] Device re-identified by MAC/IP: {device_id[:8]}...")
            else:
                if mac and mac != '00:00:00:00:00:00':
                    stable_id = hashlib.sha256(mac.encode()).hexdigest()[:16]
                else:
                    stable_id = hashlib.sha256(f"{ip}-{platform.node()}-{time.time()}".encode()).hexdigest()[:16]
                device_id = f"AEX-{stable_id}"
            conn.close()

        hostname = data.get('hostname', platform.node())
        ip = data.get('ip', request.remote_addr)
        os_name = data.get('os', 'Unknown')
        os_version = data.get('os_version', '')
        cpu = data.get('cpu', 'Unknown')
        ram = data.get('ram', 'Unknown')
        ram_total = data.get('ram_total', 0)
        architecture = data.get('architecture', '')
        mac_address = data.get('mac', '00:00:00:00:00:00')
        public_ip = data.get('public_ip', request.remote_addr)
        country = data.get('country', 'Unknown')
        city = data.get('city', 'Unknown')
        latitude = data.get('latitude', 0.0)
        longitude = data.get('longitude', 0.0)

        # SAFETY NET: if this ID is new but the same MAC already exists, reuse it
        if mac_address and mac_address != '00:00:00:00:00:00':
            conn = get_db()
            row = conn.execute(
                "SELECT id FROM devices WHERE mac=? AND deleted=0", (mac_address,)
            ).fetchone()
            if row and row['id'] != device_id:
                print(f"[+] Reused existing identity by MAC: {row['id'][:8]}...")
                device_id = row['id']
            existing_deleted = conn.execute(
                "SELECT deleted FROM devices WHERE id=?", (device_id,)
            ).fetchone()
            was_deleted = bool(existing_deleted and existing_deleted['deleted'])
            conn.close()
        else:
            was_deleted = False

        now_iso = datetime.now().isoformat()

        device_info = {
            'id': device_id,
            'hostname': hostname,
            'ip': ip,
            'os': os_name,
            'os_version': os_version,
            'cpu': cpu,
            'ram': ram,
            'ram_total': ram_total,
            'architecture': architecture,
            'mac': mac_address,
            'public_ip': public_ip,
            'country': country,
            'city': city,
            'latitude': latitude,
            'longitude': longitude,
            'status': 'online',
            'last_seen': now_iso,
            'connected': True,
        }

        is_new = device_id not in connected_devices
        save_device_to_db(device_info)
        
        if is_new:
            device_info['registered_at'] = now_iso
            device_info['sessions'] = 0
            device_info['data_usage'] = '0 MB'
            connected_devices[device_id] = device_info
            
            msg = f'NODE CONNECTED: {hostname} ({os_name}) — IP: {ip} — Location: {city}, {country}'
            add_notification('connection', msg)
            activity('DEVICE REGISTERED', device_id=device_id[:8], host=hostname, ip=ip, os=os_name)
            print(f"[+] New device registered: {hostname} ({device_id[:8]}...)")
        else:
            connected_devices[device_id].update(device_info)
            connected_devices[device_id]['status'] = 'online'
            connected_devices[device_id]['last_seen'] = now_iso
            print(f"[+] Device re-registered: {hostname} ({device_id[:8]}...)")
            if was_deleted:
                add_notification('connection', f'NODE RE-REGISTERED: {hostname} — agent still running, device restored to inventory')
                print(f"[+] Device re-enabled after removal: {hostname} ({device_id[:8]}...)")

        socketio.emit('devices_updated', {
            'devices': get_device_list_for_dashboard()
        })

        return jsonify({
            'success': True,
            'device_id': device_id,
            'message': 'Device registered successfully'
        }), 200

    except Exception as e:
        print(f"[-] Registration error: {e}")
        return jsonify({'error': str(e)}), 400


# ============================================================
# Helper: Build device list for dashboard
# ============================================================
def get_device_list_for_dashboard():
    devices_list = []
    for dev_id, dev in connected_devices.items():
        devices_list.append({
            'id': dev_id,
            'hostname': dev.get('hostname', 'Unknown'),
            'ip': dev.get('ip', '0.0.0.0'),
            'os': dev.get('os') or dev.get('os_name', 'Unknown'),
            'os_name': dev.get('os_name') or dev.get('os', 'Unknown'),
            'os_version': dev.get('os_version', ''),
            'cpu': dev.get('cpu', 'Unknown'),
            'ram': dev.get('ram', 'Unknown'),
            'ram_total': dev.get('ram_total', 0),
            'status': dev.get('status', 'offline'),
            'last_seen': dev.get('last_seen', ''),
            'country': dev.get('country', 'Unknown'),
            'city': dev.get('city', 'Unknown'),
            'public_ip': dev.get('public_ip', ''),
            'mac': dev.get('mac', ''),
            'architecture': dev.get('architecture', ''),
            'latitude': dev.get('latitude', 0.0),
            'longitude': dev.get('longitude', 0.0),
            'alerts': get_alerts_from_db(dev_id)
        })
    
    devices_list.sort(
        key=lambda x: (
            0 if x['status'] == 'online' else 1,
            x.get('last_seen', '')
        ),
        reverse=True
    )
    return devices_list


# ============================================================
# API: DASHBOARD — canonical JSON contract
# Compatible with aeyes_data.db
# ============================================================
@app.route('/api/dashboard', methods=['GET'])
def api_dashboard():
    try:
        server_time = datetime.now().isoformat()

        # ------------------------------------------------------------
        # SCOPE
        #
        # The header "Target Node" selector drives this. With no device_id the
        # payload describes the whole system (ALL EYES STAT). With a device_id
        # every telemetry / traffic / chart query is limited to that device.
        # ------------------------------------------------------------
        scope_device = (request.args.get('device_id') or '').strip() or None
        scope_where = 'WHERE device_id = ?' if scope_device else ''
        scope_args = (scope_device,) if scope_device else ()

        # ============================================================
        # 0. DEVICES
        # ============================================================
        devices_list = get_device_list_for_dashboard()

        total = len(devices_list)
        online = sum(
            1 for d in devices_list
            if str(d.get('status', '')).lower() == 'online'
        )
        offline = total - online

        # ============================================================
        # 1. DATABASE HELPER — PUT _q() HERE
        # ============================================================
        def _q(sql, args=()):
            try:
                import sqlite3
                from pathlib import Path

                # Use the same SQLite database file as the running Flask app.
                db_path = Path(DB_PATH)

                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row

                try:
                    rows = conn.execute(sql, args).fetchall()
                    return [dict(row) for row in rows]
                finally:
                    conn.close()

            except Exception as e:
                print(f"[DASHBOARD DB ERROR] {e}")
                return []

        # ------------------------------------------------------------
        # DATABASE FALLBACK
        #
        # If the helper returns nothing, use the real devices table.
        # ------------------------------------------------------------

        if not devices_list:

            db_devices = _q("""
                SELECT
                    id,
                    hostname,
                    ip,
                    os_name,
                    os_version,
                    cpu,
                    ram,
                    ram_total,
                    architecture,
                    mac,
                    public_ip,
                    country,
                    city,
                    latitude,
                    longitude,
                    status,
                    last_seen,
                    registered_at,
                    connected,
                    sessions,
                    data_usage,
                    deleted
                FROM devices
                WHERE COALESCE(deleted, 0) = 0
                ORDER BY hostname ASC
            """)

            devices_list = []

            for d in db_devices:

                # ----------------------------------------------------
                # Normalize status
                # ----------------------------------------------------

                raw_status = str(
                    d.get('status') or ''
                ).strip().lower()

                connected = bool(d.get('connected'))

                if raw_status in (
                    'online',
                    'connected',
                    'active',
                    'reachable'
                ):
                    status = 'online'

                elif connected:
                    status = 'online'

                else:
                    status = 'offline'

                devices_list.append({
                    'id': d.get('id'),
                    'device_id': d.get('id'),
                    'hostname': d.get('hostname') or 'Unknown Device',
                    'name': d.get('hostname') or 'Unknown Device',

                    'ip': d.get('ip'),
                    'public_ip': d.get('public_ip'),

                    'os': d.get('os_name'),
                    'os_name': d.get('os_name'),
                    'os_version': d.get('os_version'),

                    'cpu': d.get('cpu'),
                    'ram': d.get('ram'),
                    'ram_total': d.get('ram_total'),

                    'architecture': d.get('architecture'),
                    'mac': d.get('mac'),

                    'country': d.get('country'),
                    'city': d.get('city'),
                    'latitude': d.get('latitude'),
                    'longitude': d.get('longitude'),

                    'status': status,
                    'connected': connected,

                    'last_seen': d.get('last_seen'),
                    'registered_at': d.get('registered_at'),

                    'sessions': d.get('sessions') or 0,
                    'data_usage': d.get('data_usage'),

                    'risk': None,
                    'risk_score': None,
                })

        total = len(devices_list)

        online = sum(
            1
            for d in devices_list
            if str(
                d.get('status', '')
            ).lower() in (
                'online',
                'connected',
                'active',
                'reachable'
            )
        )

        offline = total - online

        # ============================================================
        # 1. ALERTS
        # ============================================================

        alert_rows = _q("""
            SELECT
                id,
                device_id,
                type,
                message,
                timestamp,
                severity,
                title,
                category,
                status
            FROM alerts
            ORDER BY timestamp DESC
            LIMIT 15
        """)

        # ------------------------------------------------------------
        # Notifications fallback
        #
        # notifications DOES NOT have a status column.
        # ------------------------------------------------------------

        if not alert_rows:

            alert_rows = _q("""
                SELECT
                    id,
                    type,
                    message,
                    timestamp
                FROM notifications
                ORDER BY timestamp DESC
                LIMIT 15
            """)

        recent_alerts = []

        # hostname lookup so device-scoped alerts can name their device
        device_names = {}
        for _d in devices_list:
            _did = _d.get('id') or _d.get('device_id')
            if _did:
                device_names[_did] = (
                    _d.get('hostname') or _d.get('name') or _did
                )

        for a in alert_rows:

            severity = str(
                a.get('severity')
                or a.get('type')
                or 'info'
            ).lower()

            recent_alerts.append({
                'id': a.get('id'),

                'severity': severity,

                'title': (
                    a.get('title')
                    or a.get('message')
                    or 'Alert'
                ),

                'message': (
                    a.get('message')
                    or a.get('title')
                    or ''
                ),

                'category': (
                    a.get('category')
                    or severity
                ),

                'status': (
                    a.get('status')
                    or 'open'
                ),

                'timestamp': (
                    a.get('timestamp')
                    or time.time()
                ),

                # Alert Center requires: device name, type, cause, proposed fix
                'device_id': (
                    a.get('device_id') or scope_device or ''
                ),

                'device': (
                    device_names.get(
                        a.get('device_id') or scope_device or '',
                        'Entire system',
                    )
                ),
            })

            _cause, _fix = explain_alert(
                recent_alerts[-1]['message'],
                recent_alerts[-1].get('category', ''),
            )
            recent_alerts[-1]['cause'] = _cause
            recent_alerts[-1]['fix'] = _fix

        # ------------------------------------------------------------
        # Alert severity counts
        # ------------------------------------------------------------

        alert_counts = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0,
        }

        severity_rows = _q("""
            SELECT
                severity,
                COUNT(*) AS count
            FROM alerts
            GROUP BY severity
        """)

        for row in severity_rows:

            severity = str(
                row.get('severity') or ''
            ).lower()

            if severity in alert_counts:
                alert_counts[severity] = int(
                    row.get('count') or 0
                )

        alerts_payload = {
            'total': sum(alert_counts.values()),

            'open': sum(
                1
                for alert in recent_alerts
                if str(
                    alert.get('status', '')
                ).lower() == 'open'
            ),

            'recent': recent_alerts,

            **alert_counts,
        }

        # ============================================================
        # 2. TRAFFIC
        # ============================================================

        traffic_payload = {
            'upload': 0,
            'download': 0,
            'total': 0,
            'bandwidth': 0,
            'busiest_device': None,
            'trend': [],
        }

        # ------------------------------------------------------------
        # Latest traffic sample
        # ------------------------------------------------------------

        traffic_rows = _q("""
            SELECT
                id,
                ts,
                device_id,
                download,
                upload
            FROM traffic_samples
            {}
            ORDER BY ts DESC
            LIMIT 1
        """.format(scope_where), scope_args)

        if traffic_rows:

            traffic = traffic_rows[0]

            upload = float(
                traffic.get('upload') or 0
            )

            download = float(
                traffic.get('download') or 0
            )

            traffic_payload.update({
                'upload': upload,
                'download': download,

                'total': (
                    upload + download
                ),

                'bandwidth': (
                    upload + download
                ),

                'busiest_device': (
                    traffic.get('device_id')
                ),
            })

        # ------------------------------------------------------------
        # Traffic trend
        # ------------------------------------------------------------

        trend_rows = _q("""
            SELECT
                ts AS t,
                download AS download,
                upload AS upload
            FROM traffic_samples
            {}
            ORDER BY ts DESC
            LIMIT 30
        """.format(scope_where), scope_args)
        trend_rows.reverse()

        traffic_payload['trend'] = [

            {
                't': row.get('t'),

                'download': float(
                    row.get('download') or 0
                ),

                'upload': float(
                    row.get('upload') or 0
                ),

                'v': float(
                    row.get('download') or 0
                ) + float(
                    row.get('upload') or 0
                ),
            }

            for row in trend_rows
        ]

        # ============================================================
        # 3. CHARTS
        # ============================================================

        def _series(column, default=0):

            allowed_columns = {
                'avg_cpu',
                'alerts',
                'bandwidth',
                'score',
            }

            if column not in allowed_columns:
                return []

            rows = _q(
                f"""
                SELECT
                    date AS t,
                    {column} AS v
                FROM daily_stats
                ORDER BY date ASC
                LIMIT 30
                """
            )

            return [
                {
                    't': row.get('t'),

                    'v': (
                        row.get('v')
                        if row.get('v') is not None
                        else default
                    ),
                }

                for row in rows
            ]

        # ------------------------------------------------------------
        # Daily statistics
        # ------------------------------------------------------------

        cpu_series = _series('avg_cpu')
        alert_series = _series('alerts')

        # ------------------------------------------------------------
        # CPU chart from live telemetry (daily_stats only snapshots daily,
        # so this gives the chart real short-term resolution).
        # ------------------------------------------------------------
        cpu_rows = _q("""
            SELECT
                updated_at AS t,
                cpu AS v
            FROM telemetry
            WHERE cpu IS NOT NULL {}
            ORDER BY updated_at ASC
            LIMIT 30
        """.format('AND device_id = ?' if scope_device else ''), scope_args)

        if cpu_rows:
            cpu_series = [
                {'t': row.get('t'), 'v': float(row.get('v') or 0)}
                for row in cpu_rows
            ]
        traffic_series = _series('bandwidth')
        security_series = _series('score')

        # ------------------------------------------------------------
        # RAM chart
        #
        # telemetry.ram is the real column.
        # ------------------------------------------------------------

        ram_rows = _q("""
            SELECT
                updated_at AS t,
                ram AS v
            FROM telemetry
            WHERE ram IS NOT NULL {}
            ORDER BY updated_at ASC
            LIMIT 30
        """.format('AND device_id = ?' if scope_device else ''), scope_args)

        ram_series = [

            {
                't': row.get('t'),
                'v': float(
                    row.get('v') or 0
                ),
            }

            for row in ram_rows
        ]

        # ------------------------------------------------------------
        # Disk chart
        # ------------------------------------------------------------

        disk_rows = _q("""
            SELECT
                updated_at AS t,
                disk AS v
            FROM telemetry
            WHERE disk IS NOT NULL {}
            ORDER BY updated_at ASC
            LIMIT 30
        """.format('AND device_id = ?' if scope_device else ''), scope_args)

        disk_series = [

            {
                't': row.get('t'),
                'v': float(
                    row.get('v') or 0
                ),
            }

            for row in disk_rows
        ]

        # ------------------------------------------------------------
        # Protocols
        #
        # traffic_samples currently has NO protocol column.
        # Do not query one.
        # ------------------------------------------------------------

        protocol_rows = []

        # ------------------------------------------------------------
        # Alert trend by severity, grouped by day. Real counts only -
        # days with no alerts are simply absent from the series.
        # ------------------------------------------------------------
        sev_rows = _q("""
            SELECT
                substr(timestamp, 1, 10) AS d,
                lower(COALESCE(severity, type, 'info')) AS sev,
                COUNT(*) AS c
            FROM alerts
            GROUP BY d, sev
            ORDER BY d ASC
            LIMIT 120
        """)

        alert_trend_map = {}
        for row in sev_rows:
            day = row.get('d') or ''
            bucket = alert_trend_map.setdefault(
                day, {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
            )
            sev = (row.get('sev') or 'low').lower()
            if sev in ('info', 'notice'):
                sev = 'low'
            if sev in bucket:
                bucket[sev] += int(row.get('c') or 0)

        alert_trend_days = sorted(alert_trend_map.keys())
        alert_trend = {
            'labels': alert_trend_days,
            'critical': [alert_trend_map[d]['critical'] for d in alert_trend_days],
            'high': [alert_trend_map[d]['high'] for d in alert_trend_days],
            'medium': [alert_trend_map[d]['medium'] for d in alert_trend_days],
            'low': [alert_trend_map[d]['low'] for d in alert_trend_days],
        }

        # ------------------------------------------------------------
        # Raw traffic samples for the traffic chart (ts is a unix float).
        # ------------------------------------------------------------
        traffic_24h = [
            {
                'ts': row.get('t'),
                'download': float(row.get('download') or 0),
                'upload': float(row.get('upload') or 0),
            }
            for row in trend_rows
        ]

        charts_payload = {

            'alert_trend': alert_trend,

            'traffic_24h': traffic_24h,

            'cpu': cpu_series,

            'ram': ram_series,

            'disk': disk_series,

            'alerts': alert_series,

            'traffic': traffic_series,

            'security': security_series,

            'protocols': [
                {
                    'name': row.get('protocol'),
                    'value': row.get('value')
                }
                for row in protocol_rows
            ],

            'growth': [],
        }

        # ============================================================
        # 4. LIVE TELEMETRY
        # ============================================================

        telemetry_rows = _q("""
            SELECT
                device_id,
                cpu,
                ram,
                disk,
                net_sent,
                net_recv,
                firewall,
                antivirus,
                open_ports,
                boot_time,
                logged_user,
                gpu,
                wifi,
                battery,
                malware_detected,
                updated_at
            FROM telemetry
            {}
            ORDER BY updated_at DESC
            LIMIT 1
        """.format(scope_where), scope_args)

        live_payload = {
            'device_id': None,

            'cpu': 0,
            'ram': 0,
            'disk': 0,

            'net_sent': 0,
            'net_recv': 0,

            'firewall': 0,
            'antivirus': 0,

            'open_ports': '',

            'boot_time': None,

            'logged_user': '',

            'gpu': '',

            'wifi': '',

            'battery': 0,

            'malware_detected': 0,

            'timestamp': server_time,
        }

        if telemetry_rows:

            telemetry = telemetry_rows[0]

            live_payload.update({

                'device_id':
                    telemetry.get('device_id'),

                'cpu':
                    telemetry.get('cpu') or 0,

                'ram':
                    telemetry.get('ram') or 0,

                'disk':
                    telemetry.get('disk') or 0,

                'net_sent':
                    telemetry.get('net_sent') or 0,

                'net_recv':
                    telemetry.get('net_recv') or 0,

                'firewall':
                    telemetry.get('firewall') or 0,

                'antivirus':
                    telemetry.get('antivirus') or 0,

                'open_ports':
                    telemetry.get('open_ports') or '',

                'boot_time':
                    telemetry.get('boot_time'),

                'logged_user':
                    telemetry.get('logged_user') or '',

                'gpu':
                    telemetry.get('gpu') or '',

                'wifi':
                    telemetry.get('wifi') or '',

                'battery':
                    telemetry.get('battery') or 0,

                'malware_detected':
                    telemetry.get('malware_detected') or 0,

                'timestamp':
                    telemetry.get('updated_at')
                    or server_time,
            })

        # ============================================================
        # 5. RISK RANKING
        # ============================================================

        risk_rows = [

            device

            for device in devices_list

            if (
                device.get('risk') is not None
                or device.get('risk_score') is not None
            )
        ]

        def _risk_value(device):

            try:

                return float(
                    device.get('risk')
                    or device.get('risk_score')
                    or 0
                )

            except (TypeError, ValueError):

                return 0

        risk_ranking = sorted(
            risk_rows,
            key=_risk_value,
            reverse=True,
        )[:5]

        # ============================================================
        # 6. AUTHENTICATION
        # ============================================================

        auth_rows = _q("""
            SELECT
                id,
                username,
                success,
                ip,
                remote,
                source,
                timestamp
            FROM auth_attempts
            ORDER BY timestamp DESC
            LIMIT 10
        """)

        auth_payload = {
            'successful': 0,
            'failed': 0,
            'suspicious': 0,

            'success_today': 0,
            'failed_today': 0,

            'brute_force_attempts': 0,

            'recent': [],
        }

        # Real counters straight from the auth_attempts table.
        today_prefix = datetime.now().strftime('%Y-%m-%d')
        _today = _q(
            "SELECT SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) AS ok, "
            "SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS bad "
            "FROM auth_attempts WHERE timestamp LIKE ?",
            (today_prefix + '%',),
        )
        if _today:
            auth_payload['success_today'] = int(_today[0].get('ok') or 0)
            auth_payload['failed_today'] = int(_today[0].get('bad') or 0)

        # Brute force = 5+ failures from one source inside the lock window.
        _bf = _q(
            "SELECT ip, COUNT(*) AS c FROM auth_attempts "
            "WHERE success=0 AND timestamp >= ? "
            "GROUP BY ip HAVING c >= ?",
            ((datetime.now() - timedelta(minutes=AUTH_LOCK_WINDOW_MINUTES)).isoformat(),
             AUTH_LOCK_THRESHOLD),
        )
        auth_payload['brute_force_attempts'] = len(_bf)
        auth_payload['brute_force_sources'] = [r.get('ip') for r in _bf]

        for row in auth_rows:

            success = bool(
                row.get('success')
            )

            if success:

                auth_payload['successful'] += 1

            else:

                auth_payload['failed'] += 1

            auth_payload['recent'].append({

                'username':
                    row.get('username') or '',

                'ip':
                    row.get('ip') or '',

                'success':
                    success,

                'timestamp':
                    row.get('timestamp'),

                'remote':
                    bool(row.get('remote')),

                'source':
                    row.get('source') or '',
            })

        # ============================================================
        # 7. SERVER HEALTH
        # ============================================================

        server_health_payload = {

            'status': 'online',

            'cpu':
                live_payload.get('cpu', 0),

            'memory':
                live_payload.get('ram', 0),

            'disk':
                live_payload.get('disk', 0),

            'uptime': '—',

            'processes': 0,

            'threads': 0,

            'db_size': 0,

            'db': 'unknown',
        }

        try:

            db_path = os.path.join(
                app.root_path,
                'aeyes_data.db'
            )

            if os.path.exists(db_path):

                server_health_payload['db_size'] = (
                    os.path.getsize(db_path)
                )

                server_health_payload['db'] = 'online'

            else:

                server_health_payload['db'] = 'offline'

        except Exception as e:

            print(
                f"[DASHBOARD] DB health check failed: {e}"
            )

            server_health_payload['db'] = 'offline'

        # ============================================================
        # 8. SECURITY
        #
        # Real, aggregated, explainable score. Every point comes from stored
        # telemetry / alerts / auth data - nothing is simulated.
        #
        # Formula (starts at 100, then):
        #   -15  any monitored device has firewall disabled
        #   -15  any monitored device has antivirus disabled
        #   -35  any device reports malware
        #   -3 per device offline (max 15)
        #   -4 per open critical/high alert (max 20)
        #   -2 per failed login in last 24h (max 10)
        # ============================================================

        if scope_device:
            all_telemetry = _q(
                "SELECT device_id, firewall, antivirus, malware_detected FROM telemetry WHERE device_id = ?",
                (scope_device,),
            )
        else:
            all_telemetry = _q(
                "SELECT device_id, firewall, antivirus, malware_detected FROM telemetry"
            )

        security_factors = []
        security_score = 100

        if all_telemetry:
            fw_off = sum(1 for t in all_telemetry if not bool(t.get('firewall')))
            av_off = sum(1 for t in all_telemetry if not bool(t.get('antivirus')))
            malware_hits = sum(1 for t in all_telemetry if bool(t.get('malware_detected')))

            if fw_off:
                security_score -= 15
                security_factors.append({
                    'label': f'{fw_off} device(s) with firewall disabled',
                    'impact': -15,
                })
            else:
                security_factors.append({'label': 'Firewall active on all reporting devices', 'impact': 0})

            if av_off:
                security_score -= 15
                security_factors.append({
                    'label': f'{av_off} device(s) with antivirus disabled',
                    'impact': -15,
                })
            else:
                security_factors.append({'label': 'Antivirus active on all reporting devices', 'impact': 0})

            if malware_hits:
                security_score -= 35
                security_factors.append({
                    'label': f'{malware_hits} device(s) report malware indicators',
                    'impact': -35,
                })
            else:
                security_factors.append({'label': 'No malware indicators reported', 'impact': 0})
        else:
            security_score = None
            security_factors.append({
                'label': 'No security telemetry stored yet - waiting for agent heartbeat',
                'impact': 0,
            })

        if security_score is not None:
            if offline:
                penalty = min(offline * 3, 15)
                security_score -= penalty
                security_factors.append({
                    'label': f'{offline} device(s) offline',
                    'impact': -penalty,
                })

            alert_penalty = min(
                (alert_counts.get('critical', 0) * 2 + alert_counts.get('high', 0)) * 4, 20
            )
            if alert_penalty:
                security_score -= alert_penalty
                security_factors.append({
                    'label': f"{alert_counts.get('critical', 0)} critical / {alert_counts.get('high', 0)} high alerts",
                    'impact': -alert_penalty,
                })

            since_24h = (datetime.now() - timedelta(hours=24)).isoformat()
            failed_rows = _q(
                "SELECT COUNT(*) AS c FROM auth_attempts WHERE success = 0 AND timestamp >= ?",
                (since_24h,),
            )
            failed_24h = int(failed_rows[0].get('c') or 0) if failed_rows else 0
            if failed_24h:
                auth_penalty = min(int(failed_24h) * 2, 10)
                security_score -= auth_penalty
                security_factors.append({
                    'label': f'{failed_24h} failed login(s) in 24h',
                    'impact': -auth_penalty,
                })

            security_score = max(0, min(100, security_score))

        if security_score is None:
            security_grade = 'Collecting'
        elif security_score >= 90:
            security_grade = 'Excellent'
        elif security_score >= 75:
            security_grade = 'Good'
        elif security_score >= 50:
            security_grade = 'Warning'
        else:
            security_grade = 'Critical'

        # ============================================================
        # 9. FINAL PAYLOAD
        # ============================================================

        payload = {

            'server_time':
                server_time,

            'version':
                '3.5',

            # which device the payload describes (None = ALL EYES STAT)
            'scope': {
                'device_id': scope_device,
                'label': 'ALL EYES STAT' if not scope_device else scope_device,
            },

            # --------------------------------------------------------
            # DEVICES
            # --------------------------------------------------------

            'devices': {

                'total':
                    total,

                'online':
                    online,

                'offline':
                    offline,

                'list':
                    devices_list,
            },

            # --------------------------------------------------------
            # SECURITY
            # --------------------------------------------------------

            'security': {

                'score':
                    security_score,

                'status':
                    'active' if telemetry_rows else 'collecting',

                'grade':
                    security_grade,

                'message':
                    (
                        'Security telemetry active'
                        if telemetry_rows
                        else 'Waiting for telemetry'
                    ),

                # real, explainable contributors - rendered by SecurityScore
                'risk_factors':
                    security_factors,

                'factors':
                    security_factors,

                'telemetry_devices':
                    len(all_telemetry),
            },

            # --------------------------------------------------------
            # ALERTS
            # --------------------------------------------------------

            'alerts':
                alerts_payload,

            # --------------------------------------------------------
            # TRAFFIC
            # --------------------------------------------------------

            'traffic':
                traffic_payload,

            # --------------------------------------------------------
            # PROTOCOLS
            # --------------------------------------------------------

            'protocols':
                charts_payload['protocols'],

            # --------------------------------------------------------
            # RISK
            # --------------------------------------------------------

            'risk_ranking':
                risk_ranking,

            # --------------------------------------------------------
            # AUTH
            # --------------------------------------------------------

            'auth':
                auth_payload,

            # --------------------------------------------------------
            # HEALTH
            # --------------------------------------------------------

            'health': {

                'status':
                    'online'
                    if telemetry_rows
                    else 'waiting',

                'avg_cpu':
                    live_payload.get('cpu', 0),

                'avg_ram':
                    live_payload.get('ram', 0),

                'services': [],
            },

            # --------------------------------------------------------
            # SERVER
            # --------------------------------------------------------

            'server_health':
                server_health_payload,

            # --------------------------------------------------------
            # CHARTS
            # --------------------------------------------------------

            'charts': {

                'alert_trend':
                    charts_payload['alert_trend'],

                'traffic_24h':
                    charts_payload['traffic_24h'],

                'cpu':
                    charts_payload['cpu'],

                'ram':
                    charts_payload['ram'],

                'disk':
                    charts_payload['disk'],

                'alerts':
                    charts_payload['alerts'],

                'traffic':
                    charts_payload['traffic'],

                'security':
                    charts_payload['security'],

                'protocols':
                    charts_payload['protocols'],

                'growth':
                    charts_payload['growth'],
            },

            # --------------------------------------------------------
            # TRENDS
            # --------------------------------------------------------

            'trends': {

                'security':
                    charts_payload['security'],

                'alerts':
                    charts_payload['alerts'],

                'traffic':
                    charts_payload['traffic'],
            },

            # --------------------------------------------------------
            # GEO
            # --------------------------------------------------------

            'geo': {

                'devices': [

                    {

                        'id':
                            d.get('id')
                            or d.get('device_id'),

                        'hostname':
                            d.get('hostname')
                            or d.get('name')
                            or 'Unknown Device',

                        'latitude':
                            d.get('latitude'),

                        'longitude':
                            d.get('longitude'),

                        'country':
                            d.get('country'),

                        'city':
                            d.get('city'),

                        'status':
                            d.get('status'),
                    }

                    for d in devices_list
                ],
            },

            # --------------------------------------------------------
            # LIVE
            # --------------------------------------------------------

            'live':
                live_payload,

            # --------------------------------------------------------
            # THREAT
            # --------------------------------------------------------

            'threat': {

                'score':
                    100 - security_score,

                'level': (
                    'HIGH'
                    if security_score < 50
                    else 'MEDIUM'
                    if security_score < 75
                    else 'LOW'
                ),
            },

            # --------------------------------------------------------
            # ACTIVITY
            # --------------------------------------------------------

            'activity':
                recent_alerts[:5],

            # --------------------------------------------------------
            # FOOTER
            # --------------------------------------------------------

            'footer': {

                'message':
                    'ALL EYES X running — engine telemetry collecting',
            },

            # --------------------------------------------------------
            # BACKWARD COMPATIBILITY
            # --------------------------------------------------------

            'total_devices':
                total,

            'online_devices':
                online,

            'offline_devices':
                offline,
        }

        return jsonify(payload), 200

    except Exception as e:

        print(
            f'[DASHBOARD] Error: {e}'
        )

        import traceback

        traceback.print_exc()

        return jsonify({

            'error':
                'Dashboard data generation failed',

            'message':
                str(e),

        }), 500

# ============================================================
# HEARTBEAT
# ============================================================
@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    try:
        data = request.get_json(force=True)
        device_id = data.get('device_id', '')

        if not device_id:
            return jsonify({'error': 'No device_id provided'}), 400

        if device_id not in connected_devices:
            return jsonify({
                'success': False,
                'message': 'Unknown device, please register',
                'error': 'Unknown device'
            }), 200

        now_iso = datetime.now().isoformat()
        connected_devices[device_id]['last_seen'] = now_iso
        connected_devices[device_id]['status'] = 'online'
        connected_devices[device_id]['ip'] = data.get('ip', connected_devices[device_id]['ip'])
        save_device_to_db(connected_devices[device_id])
        persist_telemetry(device_id, data)
        activity('HEARTBEAT', device_id=device_id[:8], host=connected_devices[device_id].get('hostname'), cpu=data.get('cpu'), ram=data.get('ram'), tasks=len(pending_tasks_queue.get(device_id, [])))

        tasks = pending_tasks_queue.get(device_id, [])
        if tasks:
            pending_tasks_queue[device_id] = []
            print(f"[*] Sending {len(tasks)} pending task(s) to {device_id[:8]}...")

        return jsonify({
            'success': True,
            'status': 'ok',
            'pending_tasks': tasks
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ============================================================
# API: COMMANDS
# ============================================================
@app.route('/api/command', methods=['POST'])
@login_required
def api_send_command():
    try:
        data = request.get_json(force=True)
        device_id = data.get('device_id', data.get('id', ''))
        command = data.get('command', data.get('cmd', ''))
        command_id = str(uuid.uuid4())

        if not device_id:
            return jsonify({'error': 'device_id is required'}), 400
        if not command:
            return jsonify({'error': 'command is required'}), 400
        if device_id not in connected_devices:
            return jsonify({'error': 'Device not found'}), 404

        task = {
            'id': command_id,
            'type': 'command',
            'command': command,
            'timestamp': datetime.now().isoformat()
        }

        if device_id not in pending_tasks_queue:
            pending_tasks_queue[device_id] = []
        pending_tasks_queue[device_id].append(task)

        hostname = connected_devices[device_id].get('hostname', device_id[:8])
        actor = session.get('user', 'unknown-admin')
        conn = get_db()
        conn.execute(
            "INSERT INTO command_results (command_id, device_id, command, requested_by, queued_at, success) VALUES (?,?,?,?,?,0)",
            (command_id, device_id, command, actor, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
        audit_event(actor, device_id, 'command_queued', 'queued', command[:1000])
        add_notification('command', f'VECTOR QUEUED for {hostname}: {command[:80]}')
        print(f"[*] Command queued for {device_id[:8]}...: {command[:60]}")

        if device_id in connected_clients_sid:
            try:
                socketio.emit('command', task, room=connected_clients_sid[device_id])
            except:
                pass

        return jsonify({
            'success': True,
            'command_id': command_id,
            'task': task,
            'message': 'Command queued for delivery'
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/command/batch', methods=['POST'])
@login_required
def api_send_command_batch():
    """Main Command mode: one command to many devices at once.

    Returns one command_id per device so the caller can track each result
    independently in its own terminal pane.
    """
    try:
        data = request.get_json(force=True) or {}
        device_ids = data.get('device_ids') or []
        command = (data.get('command') or data.get('cmd') or '').strip()
        mode = data.get('mode', 'main')

        if not command:
            return jsonify({'error': 'command is required'}), 400
        if not device_ids:
            return jsonify({'error': 'device_ids is required'}), 400

        actor = session.get('user', 'unknown-admin')
        queued = []
        skipped = []

        for device_id in device_ids:
            if device_id not in connected_devices:
                skipped.append({'device_id': device_id, 'reason': 'not connected'})
                continue

            command_id = str(uuid.uuid4())
            task = {
                'id': command_id,
                'type': 'command',
                'command': command,
                'mode': mode,
                'timestamp': datetime.now().isoformat(),
            }
            pending_tasks_queue.setdefault(device_id, []).append(task)

            hostname = connected_devices[device_id].get('hostname', device_id[:8])
            conn = get_db()
            conn.execute(
                "INSERT INTO command_results (command_id, device_id, command, requested_by, queued_at, success) "
                "VALUES (?,?,?,?,?,0)",
                (command_id, device_id, command, actor, datetime.now().isoformat()),
            )
            conn.commit()
            conn.close()

            audit_event(actor, device_id, 'command_batch_queued', 'queued', f'{mode}: {command[:1000]}')
            activity('COMMAND BATCH', mode=mode, device=device_id[:8], host=hostname, by=actor)
            queued.append({
                'device_id': device_id,
                'hostname': hostname,
                'command_id': command_id,
            })

        add_notification(
            'command',
            f'BATCH ({mode.upper()}): {actor} sent "{command[:60]}" to {len(queued)} device(s)',
        )

        return jsonify({'success': True, 'queued': queued, 'skipped': skipped, 'mode': mode}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/command/msg', methods=['POST'])
@login_required
def api_send_msg():
    """Send an administrator message to one or many devices.

    The message is delivered as a visible on-screen notification on the target
    machine - this is how the administrator tells an employee to step away
    before taking control. It is logged like every other administrative action.
    """
    try:
        data = request.get_json(force=True) or {}
        device_ids = data.get('device_ids') or []
        message = (data.get('message') or '').strip()
        if not message:
            return jsonify({'error': 'message is required'}), 400
        if not device_ids:
            return jsonify({'error': 'device_ids is required'}), 400

        actor = session.get('user', 'unknown-admin')
        delivered = []

        for device_id in device_ids:
            if device_id not in connected_devices:
                continue
            hostname = connected_devices[device_id].get('hostname', device_id[:8])
            pending_tasks_queue.setdefault(device_id, []).append({
                'id': str(uuid.uuid4()),
                'type': 'notify_user',
                'message': message,
                'from': actor,
                'timestamp': datetime.now().isoformat(),
            })
            audit_event(actor, device_id, 'admin_message_sent', 'queued', message[:1000])
            activity('MESSAGE SENT', device=device_id[:8], host=hostname, by=actor)
            add_notification('message', f'MESSAGE from {actor} to {hostname}: {message[:120]}')
            delivered.append({'device_id': device_id, 'hostname': hostname})

        return jsonify({'success': True, 'delivered': delivered}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/command/result', methods=['POST'])
def api_command_result():
    try:
        data = request.get_json(force=True)
        device_id = data.get('device_id', '')
        command_id = data.get('command_id', '')
        result_text = data.get('result', '')
        success = data.get('success', True)

        hostname = connected_devices.get(device_id, {}).get('hostname', device_id[:8])
        status = "SUCCESS" if success else "FAILED"
        conn = get_db()
        conn.execute(
            "UPDATE command_results SET result=?, success=?, completed_at=? WHERE command_id=?",
            (result_text, 1 if success else 0, datetime.now().isoformat(), command_id)
        )
        conn.commit()
        conn.close()
        audit_event('agent', device_id, 'command_result', status.lower(), f'{command_id}: {result_text[:1000]}')
        print(f"[{status}] Command {command_id[:8]}... from {hostname}")

        add_notification('command', f'VECTOR RESULT from {hostname}: {result_text[:120]}')

        if not success:
            add_alert_to_db(device_id, 'error', f'Command {command_id[:8]} failed: {result_text[:100]}', notify=False)

        return jsonify({'success': True}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/command/results', methods=['GET'])
@login_required
def api_command_results():
    limit = min(int(request.args.get('limit', 100)), 500)
    device_id = request.args.get('device_id', '')
    conn = get_db()
    if device_id:
        rows = conn.execute(
            "SELECT * FROM command_results WHERE device_id=? ORDER BY id DESC LIMIT ?",
            (device_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM command_results ORDER BY id DESC LIMIT ?",
            (limit,)
        ).fetchall()
    conn.close()
    return jsonify({'results': [dict(r) for r in rows]}), 200


@app.route('/api/remote/takeover', methods=['POST'])
@login_required
def api_remote_takeover():
    """Administrator announces and takes control.

    Per the product decision the remote user does NOT approve the session: the
    agent is told to display a visible notice while the administrator works.
    Every takeover is audited so the action is never silent or deniable.
    """
    try:
        data = request.get_json(force=True) or {}
        device_id = data.get('device_id', '')
        note = str(data.get('note', ''))[:300]

        if device_id not in connected_devices:
            return jsonify({'error': 'Device not found'}), 404

        actor = session.get('user', 'unknown-admin')
        hostname = connected_devices[device_id].get('hostname', device_id[:8])
        session_id = str(uuid.uuid4())
        now_iso = datetime.now().isoformat()

        message = note or 'An ALL EYES X administrator has taken temporary control of this device.'

        # Visible notice on the remote machine (best effort, queued as a task).
        pending_tasks_queue.setdefault(device_id, []).append({
            'id': str(uuid.uuid4()),
            'type': 'notify_user',
            'message': message,
            'timestamp': now_iso,
        })

        conn = get_db()
        conn.execute("""
            INSERT INTO remote_sessions
            (session_id, device_id, started_by, started_at, mode, notified, note)
            VALUES (?,?,?,?,?,?,?)
        """, (session_id, device_id, actor, now_iso, 'control', 1, message))
        conn.commit()
        conn.close()

        audit_event(actor, device_id, 'remote_takeover', 'started', message)
        activity('REMOTE TAKEOVER', device_id=device_id[:8], host=hostname, by=actor)
        add_notification('security', f'REMOTE CONTROL: {actor} took control of {hostname}')
        socketio.emit('remote_takeover', {
            'session_id': session_id, 'device_id': device_id, 'by': actor, 'message': message,
        })

        return jsonify({'success': True, 'session_id': session_id, 'message': message}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/remote/release', methods=['POST'])
@login_required
def api_remote_release():
    try:
        data = request.get_json(force=True) or {}
        session_id = data.get('session_id', '')
        device_id = data.get('device_id', '')
        actor = session.get('user', 'unknown-admin')

        conn = get_db()
        conn.execute(
            "UPDATE remote_sessions SET ended_at=? WHERE session_id=?",
            (datetime.now().isoformat(), session_id),
        )
        conn.commit()
        conn.close()

        pending_tasks_queue.setdefault(device_id, []).append({
            'id': str(uuid.uuid4()),
            'type': 'notify_user',
            'message': 'The administrator has released control of this device.',
            'timestamp': datetime.now().isoformat(),
        })

        audit_event(actor, device_id, 'remote_takeover', 'released', session_id)
        activity('REMOTE RELEASE', device_id=device_id[:8], by=actor)
        socketio.emit('remote_release', {'session_id': session_id, 'device_id': device_id})
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ============================================================
# TOUCH EVENT QUEUE
# ============================================================
@app.route('/api/touch/poll/<device_id>', methods=['GET'])
def poll_touch_events(device_id):
    global touch_event_queues
    queue = touch_event_queues.get(device_id, [])
    events = queue[:50]
    return jsonify({'events': events, 'device_id': device_id})


@app.route('/api/touch/ack/<device_id>', methods=['POST'])
def ack_touch_event(device_id):
    global touch_event_queues
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    
    event_id = data.get('event_id', 0)
    queue = touch_event_queues.get(device_id, [])
    touch_event_queues[device_id] = [e for e in queue if e.get('id', 0) > event_id]
    
    return jsonify({
        'status': 'acknowledged',
        'remaining': len(touch_event_queues[device_id])
    })


@app.route('/api/touch', methods=['POST'])
@login_required
def handle_touch():
    global touch_event_counter, touch_event_queues
    
    data = request.get_json()
    if not data or 'device_id' not in data:
        return jsonify({'error': 'Missing device_id'}), 400
    
    required = ['device_id', 'event', 'x', 'y']
    for field in required:
        if field not in data:
            return jsonify({'error': f'Missing field: {field}'}), 400
    
    touch_event_counter += 1
    data['id'] = touch_event_counter
    data['timestamp'] = datetime.utcnow().isoformat()
    
    device_id = data['device_id']
    touch_event_queues[device_id].append(data)
    
    try:
        socketio.emit('touch_event', data)
    except:
        pass
    
    return jsonify({
        'status': 'enqueued',
        'event_id': touch_event_counter,
        'queue_size': len(touch_event_queues.get(device_id, []))
    })


# ============================================================
# SCREENSHOT STREAMING
# ============================================================
@app.route('/api/screenshot/<device_id>', methods=['GET', 'POST'])
def api_screenshot(device_id):
    if request.method == 'POST':
        try:
            data = request.get_json(force=True)
            if not data or 'image' not in data:
                return jsonify({'error': 'No image data'}), 400
            
            image_b64 = data['image']
            latest_screenshots[device_id] = image_b64
            _now = time.time()
            latest_screenshot_meta[device_id] = {
                'ts': _now,
                'bytes': len(image_b64),
                'full_frame': bool(data.get('full_frame', True)),
            }
            _stream_frames[('screen', device_id)].append(_now)

            # NOTE: frames are deliberately NOT written to SQLite. A 300 KB blob
            # per frame at 30-60 FPS means 30-60 large DELETE+INSERT pairs every
            # second, which saturates the disk on a modest Windows 10 machine and
            # is the main reason the stream collapsed to ~4 FPS. Live frames are
            # ephemeral; only the newest one per device is kept in memory.

            socketio.emit('screenshare_frame', {
                'device_id': device_id,
                'image': image_b64,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'full_frame': data.get('full_frame', True),
                'x': data.get('x', 0),
                'y': data.get('y', 0),
                'width': data.get('width', 0),
                'height': data.get('height', 0),
                'screen_width': data.get('screen_width', 0),
                'screen_height': data.get('screen_height', 0),
            })
            
            return jsonify({'status': 'ok'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    else:
        if device_id in latest_screenshots:
            return jsonify({'image': latest_screenshots[device_id], 'device_id': device_id}), 200
        return jsonify({'error': 'No screenshot available'}), 404


def _measure_fps(kind, device_id):
    """Real frames-per-second measured from arrival timestamps."""
    stamps = list(_stream_frames.get((kind, device_id), []))
    if len(stamps) < 2:
        return 0.0
    window = stamps[-1] - stamps[0]
    if window <= 0:
        return 0.0
    return round((len(stamps) - 1) / window, 1)


@app.route('/api/device/<device_id>/software', methods=['POST'])
def api_device_software_update(device_id):
    """Store the installed-apps / files / media inventory from the agent."""
    if device_id not in connected_devices:
        return jsonify({'error': 'Device not found'}), 404
    try:
        data = request.get_json(force=True) or {}
        apps_block = data.get('installed_apps') or {}
        files_block = data.get('user_files') or {}

        apps = apps_block.get('apps') or []
        files = files_block.get('files') or []

        conn = get_db()
        conn.execute("""
            INSERT OR REPLACE INTO software_inventory
            (device_id, installed_apps, app_count, user_files, file_counts, truncated, updated_at)
            VALUES (?,?,?,?,?,?,?)
        """, (
            device_id,
            json.dumps(apps),
            int(apps_block.get('count') or len(apps)),
            json.dumps(files),
            json.dumps(files_block.get('counts') or {}),
            1 if files_block.get('truncated') else 0,
            datetime.now().isoformat(),
        ))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'device_id': device_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/stream/stats/<device_id>', methods=['GET'])
def api_stream_stats(device_id):
    """Real, measured stream statistics for the Data Check panel."""
    screen_meta = latest_screenshot_meta.get(device_id) or {}
    cam_meta = latest_webcam_meta.get(device_id) or {}
    now = time.time()

    screen_age = (now - screen_meta['ts']) if screen_meta.get('ts') else None
    cam_age = (now - cam_meta['ts']) if cam_meta.get('ts') else None

    return jsonify({
        'device_id': device_id,
        'screen': {
            'active': screen_age is not None and screen_age < 10,
            'fps': _measure_fps('screen', device_id),
            'last_frame_age_s': round(screen_age, 2) if screen_age is not None else None,
            'frame_kb': round(screen_meta.get('bytes', 0) * 0.75 / 1024, 1),
            'full_frame': screen_meta.get('full_frame'),
        },
        'webcam': {
            'active': cam_age is not None and cam_age < 10,
            'fps': _measure_fps('cam', device_id),
            'last_frame_age_s': round(cam_age, 2) if cam_age is not None else None,
            'frame_kb': round(cam_meta.get('bytes', 0) * 0.75 / 1024, 1),
        },
        'transport': 'socket.io' if device_id in connected_clients_sid else 'http',
        'encoding': 'JPEG (change-aware dirty rectangles)',
        'encryption': 'TLS when served over https via Caddy',
    }), 200


@app.route('/api/screenshot/<device_id>/latest', methods=['GET'])
def api_screenshot_latest(device_id):
    """Raw JPEG of the newest stored frame, for the multi-device wall.

    Returns an image directly so it can be used as an <img> source without
    base64-decoding in the browser.
    """
    b64 = latest_screenshots.get(device_id)
    if not b64:
        return jsonify({'error': 'No screenshot available'}), 404
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return jsonify({'error': 'Corrupt frame'}), 500
    return Response(raw, mimetype='image/jpeg', headers={
        'Cache-Control': 'no-store, no-cache, must-revalidate',
    })


def _queue_webcam_command(device_id, payload, action):
    """Deliver a webcam command over the heartbeat queue and audit it."""
    pending_tasks_queue.setdefault(device_id, []).append({
        'id': str(uuid.uuid4()),
        'type': 'webcam_command',
        'command': payload.get('command'),
        'camera': payload.get('camera', 'front'),
        'interval': payload.get('interval', 200),
        'timestamp': datetime.now().isoformat(),
    })
    hostname = connected_devices.get(device_id, {}).get('hostname', device_id[:8])
    actor = session.get('user', 'unknown-admin')
    audit_event(actor, device_id, f'webcam_{action}', 'requested',
                f"camera={payload.get('camera', 'front')}")
    activity('WEBCAM ' + action.upper(), device_id=device_id[:8], host=hostname, by=actor)
    if action == 'start':
        add_notification('security', f'CAMERA ACTIVE: {actor} opened the camera on {hostname}')


# ============================================================
# WEBCAM STREAMING
# ============================================================
@app.route('/api/webcam/<device_id>', methods=['GET', 'POST'])
def api_webcam(device_id):
    if request.method == 'POST':
        try:
            data = request.get_json(force=True)
            if not data or 'image' not in data:
                return jsonify({'error': 'No image data'}), 400
            
            image_b64 = data['image']
            latest_webcam_frames[device_id] = image_b64
            _now = time.time()
            latest_webcam_meta[device_id] = {
                'ts': _now,
                'bytes': len(image_b64),
            }
            _stream_frames[('cam', device_id)].append(_now)

            # Same reason as screenshots: no per-frame database writes.

            socketio.emit('webcam_frame', {
                'device_id': device_id,
                'image': image_b64,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
            })
            
            return jsonify({'status': 'ok'}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 400
    else:
        if device_id in latest_webcam_frames:
            return jsonify({'image': latest_webcam_frames[device_id], 'device_id': device_id}), 200
        return jsonify({'error': 'No webcam frame available'}), 404


@app.route('/api/webcam/<device_id>/latest', methods=['GET'])
def api_webcam_latest(device_id):
    """Raw JPEG of the newest webcam frame, for the multi-camera wall."""
    b64 = latest_webcam_frames.get(device_id)
    if not b64:
        return jsonify({'error': 'No webcam frame available'}), 404
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return jsonify({'error': 'Corrupt frame'}), 500
    return Response(raw, mimetype='image/jpeg', headers={
        'Cache-Control': 'no-store, no-cache, must-revalidate',
    })


@app.route('/api/webcam/<device_id>/start', methods=['POST'])
@login_required
def start_webcam(device_id):
    data = request.get_json() or {}
    camera = data.get('camera', 'front')
    interval = data.get('interval', 200)

    payload = {
        'device_id': device_id,
        'command': 'start',
        'camera': camera,
        'interval': interval,
    }
    socketio.emit('webcam_command', payload)
    # client.py is HTTP-only and has no Socket.IO connection, so the emit above
    # never reaches it. Queue the command on the heartbeat path as well, and log
    # it - camera access must never be invisible.
    _queue_webcam_command(device_id, payload, 'start')

    return jsonify({'status': 'started', 'device_id': device_id})


@app.route('/api/webcam/<device_id>/stop', methods=['POST'])
@login_required
def stop_webcam(device_id):
    payload = {'device_id': device_id, 'command': 'stop'}
    socketio.emit('webcam_command', payload)
    _queue_webcam_command(device_id, payload, 'stop')

    return jsonify({'status': 'stopped', 'device_id': device_id})


@app.route('/api/webcam/<device_id>/switch', methods=['POST'])
@login_required
def switch_webcam(device_id):
    data = request.get_json() or {}
    camera = data.get('camera', 'front')

    payload = {'device_id': device_id, 'command': 'switch', 'camera': camera}
    socketio.emit('webcam_command', payload)
    _queue_webcam_command(device_id, payload, 'switch')

    return jsonify({'status': 'switched', 'device_id': device_id})


# ============================================================
# API: DEVICES
# ============================================================
@app.route('/api/devices', methods=['GET'])
def api_devices():
    devices_list = get_device_list_for_dashboard()
    online = sum(1 for d in devices_list if str(d.get('status', '')).lower() == 'online')
    return jsonify({
        'devices': devices_list,
        'list': devices_list,
        'total': len(devices_list),
        'online': online,
        'offline': len(devices_list) - online,
    }), 200


@app.route('/api/device/<device_id>', methods=['GET'])
def api_device_detail(device_id):
    dev = connected_devices.get(device_id)
    if not dev:
        return jsonify({'error': 'Device not found'}), 404

    return jsonify({
        'device': dev,
        'alerts': get_alerts_from_db(device_id),
        'webcam_available': device_id in latest_webcam_frames,
        'screenshare_available': device_id in latest_screenshots
    }), 200


# ============================================================
# DEVICE DETAIL — Full enriched device info
# ============================================================
@app.route('/api/device/<device_id>/detail', methods=['GET'])
def api_device_detail_full(device_id):
    dev = connected_devices.get(device_id)
    if not dev:
        return jsonify({'error': 'Device not found'}), 404
    
    conn = get_db()
    
    os_row = conn.execute("SELECT * FROM os_info WHERE device_id=?", (device_id,)).fetchone()
    os_data = dict(os_row) if os_row else {}
    
    hw_row = conn.execute("SELECT * FROM hardware_info WHERE device_id=?", (device_id,)).fetchone()
    hw_data = dict(hw_row) if hw_row else {}
    
    cpu_row = conn.execute("SELECT * FROM processor_info WHERE device_id=?", (device_id,)).fetchone()
    cpu_data = dict(cpu_row) if cpu_row else {}
    
    mem_row = conn.execute("SELECT * FROM memory_info WHERE device_id=?", (device_id,)).fetchone()
    mem_data = dict(mem_row) if mem_row else {}
    
    gpu_rows = conn.execute("SELECT * FROM gpu_info WHERE device_id=?", (device_id,)).fetchall()
    gpu_data = [dict(r) for r in gpu_rows]
    
    storage_rows = conn.execute("SELECT * FROM storage_devices WHERE device_id=?", (device_id,)).fetchall()
    storage_data = [dict(r) for r in storage_rows]
    
    net_rows = conn.execute("SELECT * FROM network_interfaces WHERE device_id=?", (device_id,)).fetchall()
    net_data = [dict(r) for r in net_rows]
    
    peri_rows = conn.execute("SELECT * FROM peripherals WHERE device_id=?", (device_id,)).fetchall()
    peri_data = [dict(r) for r in peri_rows]

    # Live security telemetry straight from the heartbeat table. This is what
    # fills the "usage / firewall / open ports" fields that used to read N/A.
    tel_row = conn.execute("SELECT * FROM telemetry WHERE device_id=?", (device_id,)).fetchone()
    tel_data = dict(tel_row) if tel_row else {}

    try:
        open_ports = json.loads(tel_data.get('open_ports') or '[]')
    except Exception:
        open_ports = []

    # Installed apps + user media/documents for the "Read More" panel.
    sw_row = conn.execute("SELECT * FROM software_inventory WHERE device_id=?", (device_id,)).fetchone()
    software_data = {}
    if sw_row:
        sw = dict(sw_row)
        def _json_or(value, fallback):
            try:
                return json.loads(value or fallback)
            except Exception:
                return json.loads(fallback)
        software_data = {
            'installed_apps': _json_or(sw.get('installed_apps'), '[]'),
            'app_count': sw.get('app_count') or 0,
            'user_files': _json_or(sw.get('user_files'), '[]'),
            'file_counts': _json_or(sw.get('file_counts'), '{}'),
            'truncated': bool(sw.get('truncated')),
            'updated_at': sw.get('updated_at'),
        }
    
    pref_rows = conn.execute("SELECT preference_key, preference_value FROM device_preferences WHERE device_id=?", (device_id,)).fetchall()
    pref_data = {r['preference_key']: r['preference_value'] for r in pref_rows}
    
    conn.close()
    
    duration = ''
    if dev.get('last_seen') and dev.get('registered_at'):
        try:
            last = datetime.fromisoformat(dev['last_seen'])
            first = datetime.fromisoformat(dev['registered_at'])
            delta = last - first
            hours = int(delta.total_seconds() // 3600)
            minutes = int((delta.total_seconds() % 3600) // 60)
            duration = f"{hours}h {minutes}m"
        except:
            pass
    
    hostname_lower = (dev.get('hostname', '') + ' ' + dev.get('os', '')).lower()
    if any(x in hostname_lower for x in ['server', 'ubuntu', 'centos', 'debian', 'redhat', 'proxmox']):
        device_type = 'server'
    elif any(x in hostname_lower for x in ['phone', 'android', 'ios', 'iphone', 'mobile']):
        device_type = 'smartphone'
    elif any(x in hostname_lower for x in ['tablet', 'ipad']):
        device_type = 'tablet'
    elif any(x in hostname_lower for x in ['mac', 'darwin', 'macbook', 'laptop', 'notebook']):
        device_type = 'laptop'
    elif any(x in hostname_lower for x in ['vm', 'virtual', 'docker', 'container', 'wsl']):
        device_type = 'vm'
    elif any(x in hostname_lower for x in ['router', 'gateway', 'firewall']):
        device_type = 'router'
    elif any(x in hostname_lower for x in ['switch', 'hub']):
        device_type = 'switch'
    elif any(x in hostname_lower for x in ['printer', 'scanner']):
        device_type = 'printer'
    else:
        device_type = 'desktop'
    
    return jsonify({
        'device': {
            'id': dev.get('id'),
            'hostname': dev.get('hostname', 'Unknown'),
            'os': dev.get('os', 'Unknown'),
            'os_version': dev.get('os_version', ''),
            'ip': dev.get('ip', '0.0.0.0'),
            'mac': dev.get('mac', '00:00:00:00:00:00'),
            'cpu': dev.get('cpu', 'Unknown'),
            'ram': dev.get('ram', 'Unknown'),
            'ram_total': dev.get('ram_total', 0),
            'architecture': dev.get('architecture', ''),
            'status': dev.get('status', 'offline'),
            'last_seen': dev.get('last_seen', ''),
            'registered_at': dev.get('registered_at', ''),
            'public_ip': dev.get('public_ip', ''),
            'country': dev.get('country', 'Unknown'),
            'city': dev.get('city', 'Unknown'),
            'latitude': dev.get('latitude', 0.0),
            'longitude': dev.get('longitude', 0.0),
            'device_type': device_type,
            'connection_duration': duration,
            'alerts': get_alerts_from_db(device_id),
            'webcam_available': device_id in latest_webcam_frames,
            'screenshare_available': device_id in latest_screenshots,
        },
        'operating_system': {
            'name': os_data.get('os_name', dev.get('os', '')),
            'version': os_data.get('os_version', dev.get('os_version', '')),
            'edition': os_data.get('edition', ''),
            'architecture': os_data.get('architecture', dev.get('architecture', '')),
            'language': os_data.get('language', ''),
            'install_date': os_data.get('install_date', ''),
            'boot_time': os_data.get('boot_time', ''),
            'kernel_version': os_data.get('kernel_version', ''),
            'build_number': os_data.get('build_number', ''),
        },
        'hardware': {
            'manufacturer': hw_data.get('manufacturer', ''),
            'model': hw_data.get('model', ''),
            'motherboard': hw_data.get('motherboard', ''),
            'bios_version': hw_data.get('bios_version', ''),
            'bios_vendor': hw_data.get('bios_vendor', ''),
            'serial_number': hw_data.get('serial_number', ''),
        },
        'processor': {
            'brand': cpu_data.get('brand', ''),
            'model': cpu_data.get('model', dev.get('cpu', '')),
            'core_count': cpu_data.get('core_count', 0),
            'logical_threads': cpu_data.get('logical_threads', 0),
            'clock_speed': cpu_data.get('clock_speed', ''),
            'usage_percent': cpu_data.get('usage_percent', 0.0),
        },
        'memory': {
            'total_gb': mem_data.get('total_gb', dev.get('ram_total', 0)),
            'available_gb': mem_data.get('available_gb', 0),
            'speed': mem_data.get('speed', ''),
            'memory_type': mem_data.get('memory_type', ''),
            'usage_percent': mem_data.get('usage_percent', 0.0),
            'slots_used': mem_data.get('slots_used', 0),
        },
        'graphics': gpu_data,
        'storage': storage_data,
        'network_interfaces': net_data,
        'peripherals': peri_data,
        'preferences': pref_data,
        'software': software_data,
        'telemetry': {
            'cpu': tel_data.get('cpu'),
            'ram': tel_data.get('ram'),
            'disk': tel_data.get('disk'),
            'net_sent': tel_data.get('net_sent'),
            'net_recv': tel_data.get('net_recv'),
            'firewall': tel_data.get('firewall'),
            'antivirus': tel_data.get('antivirus'),
            'open_ports': open_ports,
            'logged_user': tel_data.get('logged_user'),
            'boot_time': tel_data.get('boot_time'),
            'gpu': tel_data.get('gpu'),
            'wifi': tel_data.get('wifi'),
            'battery': tel_data.get('battery'),
            'malware_detected': tel_data.get('malware_detected'),
            'updated_at': tel_data.get('updated_at'),
        },
    }), 200


# ============================================================
# DEVICE REMOVAL
# ============================================================
@app.route('/api/device/<device_id>/remove', methods=['POST'])
def api_device_remove(device_id):
    if device_id not in connected_devices:
        return jsonify({'error': 'Device not found'}), 404
    
    hostname = connected_devices[device_id].get('hostname', device_id[:8])
    
    conn = get_db()
    conn.execute("UPDATE devices SET deleted=1, status='offline' WHERE id=?", (device_id,))
    conn.commit()
    conn.close()
    
    if device_id in connected_devices:
        del connected_devices[device_id]
    if device_id in latest_screenshots:
        del latest_screenshots[device_id]
    if device_id in latest_webcam_frames:
        del latest_webcam_frames[device_id]
    if device_id in pending_tasks_queue:
        del pending_tasks_queue[device_id]
    if device_id in touch_event_queues:
        del touch_event_queues[device_id]
    if device_id in connected_clients_sid:
        del connected_clients_sid[device_id]
    
    add_notification('removal', f'NODE REMOVED: {hostname} — hidden from inventory (agent may re-register if still running)')
    print(f"[-] Device removed: {hostname} ({device_id[:8]}...)")
    
    socketio.emit('devices_updated', {
        'devices': get_device_list_for_dashboard()
    })
    
    return jsonify({'success': True, 'message': f'Device {hostname} removed'}), 200


# ============================================================
# DEVICE PREFERENCES
# ============================================================
@app.route('/api/device/<device_id>/preference', methods=['GET', 'POST'])
def api_device_preference(device_id):
    if device_id not in connected_devices:
        return jsonify({'error': 'Device not found'}), 404
    
    if request.method == 'GET':
        pref_key = request.args.get('key', '')
        if pref_key:
            value = get_device_preference(device_id, pref_key)
            return jsonify({'device_id': device_id, 'key': pref_key, 'value': value}), 200
        else:
            conn = get_db()
            rows = conn.execute(
                "SELECT preference_key, preference_value FROM device_preferences WHERE device_id=?",
                (device_id,)
            ).fetchall()
            conn.close()
            prefs = {r['preference_key']: r['preference_value'] for r in rows}
            return jsonify({'device_id': device_id, 'preferences': prefs}), 200
    
    try:
        data = request.get_json(force=True)
        pref_key = data.get('key', '')
        pref_value = data.get('value', '')
        if not pref_key:
            return jsonify({'error': 'key is required'}), 400
        
        set_device_preference(device_id, pref_key, pref_value)
        return jsonify({'success': True, 'device_id': device_id, 'key': pref_key, 'value': pref_value}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ============================================================
# DEVICE HARDWARE UPDATE
# ============================================================
@app.route('/api/device/<device_id>/hardware', methods=['POST'])
def api_device_hardware_update(device_id):
    if device_id not in connected_devices:
        return jsonify({'error': 'Device not found'}), 404
    
    try:
        data = request.get_json(force=True)
        conn = get_db()
        
        os_data = data.get('os', {})
        if os_data:
            conn.execute("""
                INSERT OR REPLACE INTO os_info 
                (device_id, os_name, os_version, edition, architecture, language, install_date, boot_time, kernel_version, build_number)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                device_id,
                os_data.get('name', ''),
                os_data.get('version', ''),
                os_data.get('edition', ''),
                os_data.get('architecture', ''),
                os_data.get('language', ''),
                os_data.get('install_date', ''),
                os_data.get('boot_time', ''),
                os_data.get('kernel_version', ''),
                os_data.get('build_number', ''),
            ))
        
        hw_data = data.get('hardware', {})
        if hw_data:
            conn.execute("""
                INSERT OR REPLACE INTO hardware_info
                (device_id, manufacturer, model, motherboard, bios_version, bios_vendor, serial_number)
                VALUES (?,?,?,?,?,?,?)
            """, (
                device_id,
                hw_data.get('manufacturer', ''),
                hw_data.get('model', ''),
                hw_data.get('motherboard', ''),
                hw_data.get('bios_version', ''),
                hw_data.get('bios_vendor', ''),
                hw_data.get('serial_number', ''),
            ))
        
        cpu_data = data.get('processor', {})
        if cpu_data:
            conn.execute("""
                INSERT OR REPLACE INTO processor_info
                (device_id, brand, model, core_count, logical_threads, clock_speed, usage_percent)
                VALUES (?,?,?,?,?,?,?)
            """, (
                device_id,
                cpu_data.get('brand', cpu_data.get('model', '')),
                cpu_data.get('model', cpu_data.get('name', '')),
                cpu_data.get('core_count', cpu_data.get('cores', 0)),
                cpu_data.get('logical_threads', cpu_data.get('threads', 0)),
                cpu_data.get('clock_speed', cpu_data.get('clock_speed_mhz', '')),
                cpu_data.get('usage_percent', 0.0),
            ))
        
        mem_data = data.get('memory', {})
        if mem_data:
            conn.execute("""
                INSERT OR REPLACE INTO memory_info
                (device_id, total_gb, available_gb, speed, memory_type, usage_percent, slots_used)
                VALUES (?,?,?,?,?,?,?)
            """, (
                device_id,
                mem_data.get('total_gb', 0),
                mem_data.get('available_gb', 0),
                mem_data.get('speed', ''),
                mem_data.get('memory_type', ''),
                mem_data.get('usage_percent', 0.0),
                mem_data.get('slots_used', 0),
            ))
        
        gpu_list = data.get('graphics', [])
        if gpu_list:
            conn.execute("DELETE FROM gpu_info WHERE device_id=?", (device_id,))
            for gpu in gpu_list:
                vram = gpu.get('dedicated_memory')
                if vram in (None, '') and gpu.get('vram_gb') is not None:
                    vram = f"{gpu.get('vram_gb')} GB"
                conn.execute("""
                    INSERT INTO gpu_info (device_id, name, manufacturer, dedicated_memory, driver_version, current_usage)
                    VALUES (?,?,?,?,?,?)
                """, (
                    device_id,
                    gpu.get('name', ''),
                    gpu.get('manufacturer', ''),
                    vram or '',
                    gpu.get('driver_version') or gpu.get('driver') or '',
                    gpu.get('current_usage', 0.0),
                ))
        
        storage_list = data.get('storage', [])
        if storage_list:
            conn.execute("DELETE FROM storage_devices WHERE device_id=?", (device_id,))
            for disk in storage_list:
                def _gb(value):
                    return f"{value} GB" if value not in (None, '') else ''

                conn.execute("""
                    INSERT INTO storage_devices (device_id, name, drive_type, capacity, used, free, health)
                    VALUES (?,?,?,?,?,?,?)
                """, (
                    device_id,
                    disk.get('name') or disk.get('label') or disk.get('device') or '',
                    disk.get('drive_type', ''),
                    disk.get('capacity') or _gb(disk.get('total_gb')),
                    disk.get('used') or _gb(disk.get('used_gb')),
                    disk.get('free') or _gb(disk.get('free_gb')),
                    disk.get('health', ''),
                ))
        
        net_list = data.get('network_interfaces', [])
        if net_list:
            conn.execute("DELETE FROM network_interfaces WHERE device_id=?", (device_id,))
            for netif in net_list:
                speed = netif.get('speed')
                if speed in (None, '') and netif.get('speed_mbps') is not None:
                    speed = f"{netif.get('speed_mbps')} Mbps"
                status = netif.get('status')
                if status in (None, '') and netif.get('is_up') is not None:
                    status = 'up' if netif.get('is_up') else 'down'
                conn.execute("""
                    INSERT INTO network_interfaces (device_id, name, interface_type, ipv4, ipv6, mac, gateway, dns, speed, status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    device_id,
                    netif.get('name', ''),
                    netif.get('interface_type', ''),
                    netif.get('ipv4') or netif.get('ip') or '',
                    netif.get('ipv6', ''),
                    netif.get('mac', ''),
                    netif.get('gateway', ''),
                    netif.get('dns', ''),
                    speed or '',
                    status or '',
                ))
        
        peri_list = data.get('peripherals', [])
        if peri_list:
            conn.execute("DELETE FROM peripherals WHERE device_id=?", (device_id,))
            for peri in peri_list:
                if isinstance(peri, str):
                    peri = {'name': peri, 'manufacturer': '', 'connection_type': '', 'status': 'reported'}
                conn.execute("""
                    INSERT INTO peripherals (device_id, name, manufacturer, connection_type, status)
                    VALUES (?,?,?,?,?)
                """, (
                    device_id,
                    peri.get('name', ''),
                    peri.get('manufacturer', ''),
                    peri.get('connection_type', ''),
                    peri.get('status', ''),
                ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'device_id': device_id}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ============================================================
# API: SECURITY ASSESSMENT
# ============================================================
@app.route('/api/security/assessment', methods=['GET'])
def api_security_assessment():
    devices_list = []
    for dev_id, dev in connected_devices.items():
        score = 100
        alerts_list = []
        
        if dev.get('status') != 'online':
            score -= 10
            alerts_list.append('Device offline')
        
        threat = 'low'
        if score < 40:
            threat = 'critical'
        elif score < 60:
            threat = 'high'
        elif score < 80:
            threat = 'medium'
        
        devices_list.append({
            'device_id': dev_id,
            'hostname': dev.get('hostname', 'Unknown'),
            'ip_address': dev.get('ip', '0.0.0.0'),
            'score': max(0, score),
            'threat_level': threat,
            'alerts': alerts_list,
            'alert_count': len(alerts_list),
        })
    
    overall = round(sum(d['score'] for d in devices_list) / max(len(devices_list), 1), 1)
    
    return jsonify({
        'devices': devices_list,
        'overall_score': overall,
        'total_devices': len(devices_list),
        'critical_count': sum(1 for d in devices_list if d['threat_level'] == 'critical'),
        'high_count': sum(1 for d in devices_list if d['threat_level'] == 'high'),
        'medium_count': sum(1 for d in devices_list if d['threat_level'] == 'medium'),
        'low_count': sum(1 for d in devices_list if d['threat_level'] == 'low'),
    }), 200


NMAP_SCAN_TYPES = {
    'ping': 'Host discovery',
    'top_ports': 'Top 100 TCP ports',
    'service': 'Service/version detection',
    'os': 'OS guess',
    'udp_light': 'Light UDP scan',
    'vuln_safe': 'Safe vulnerability scripts',
}


@app.route('/api/security/nmap/scan', methods=['POST'])
@login_required
def api_nmap_scan():
    try:
        data = request.get_json(force=True)
        device_id = data.get('device_id', '')
        target = data.get('target', '')
        scan_type = data.get('scan_type', 'top_ports')

        if device_id not in connected_devices:
            return jsonify({'error': 'Device not found'}), 404
        if scan_type not in NMAP_SCAN_TYPES:
            return jsonify({'error': 'Invalid scan type'}), 400

        normalized_target = validate_scan_target(target)
        scan_id = str(uuid.uuid4())
        actor = session.get('user', 'unknown-admin')
        command_label = f'nmap_{scan_type} {normalized_target}'
        now_iso = datetime.now().isoformat()

        task = {
            'id': scan_id,
            'type': 'nmap_scan',
            'scan_type': scan_type,
            'target': normalized_target,
            'timestamp': now_iso,
        }
        pending_tasks_queue.setdefault(device_id, []).append(task)

        conn = get_db()
        conn.execute("""
            INSERT INTO security_scans
            (scan_id, device_id, scan_type, target, status, command, requested_by, queued_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, (scan_id, device_id, scan_type, normalized_target, 'queued', command_label, actor, now_iso))
        conn.commit()
        conn.close()

        audit_event(actor, device_id, 'nmap_scan_queued', 'queued', f'{scan_type} {normalized_target}')
        activity('NMAP SCAN QUEUED', scan_id=scan_id[:8], device_id=device_id[:8], scan_type=scan_type, target=normalized_target)
        socketio.emit('nmap_scan_update', {'scan_id': scan_id, 'status': 'queued'})
        return jsonify({'success': True, 'scan_id': scan_id, 'status': 'queued'}), 200
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/security/nmap/result', methods=['POST'])
def api_nmap_result():
    try:
        data = request.get_json(force=True)
        scan_id = data.get('scan_id', '')
        device_id = data.get('device_id', '')
        success = bool(data.get('success'))
        result = data.get('result', '')
        parsed = data.get('parsed', {})
        error = data.get('error', '')
        now_iso = datetime.now().isoformat()
        status = 'completed' if success else 'failed'

        conn = get_db()
        conn.execute("""
            UPDATE security_scans
            SET status=?, result=?, parsed_json=?, error=?, completed_at=?
            WHERE scan_id=? AND device_id=?
        """, (status, result, json.dumps(parsed), error, now_iso, scan_id, device_id))
        conn.commit()
        conn.close()

        audit_event('agent', device_id, 'nmap_scan_result', status, f'{scan_id}: {error or result[:1000]}')
        activity('NMAP SCAN RESULT', scan_id=scan_id[:8], device_id=device_id[:8], status=status)
        socketio.emit('nmap_scan_update', {'scan_id': scan_id, 'status': status})
        if not success:
            add_alert_to_db(device_id, 'error', f'Nmap scan failed: {error or result[:120]}')
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/discovery/network', methods=['POST'])
@login_required
def api_discovery_network():
    """Discover hosts on the administrator's own network.

    Runs on the SERVER machine (which is on the LAN / Tailscale net) so it can
    reach hosts that have no agent installed yet. Restricted to private and
    Tailscale ranges by validate_scan_target() - never the public internet.
    """
    try:
        data = request.get_json(force=True) or {}
        target = (data.get('target') or '').strip()
        if not target:
            return jsonify({'error': 'target is required (e.g. 192.168.1.0/24)'}), 400

        network = validate_scan_target(target)

        if not shutil.which('nmap'):
            return jsonify({
                'error': 'nmap is not installed on the server machine',
                'hint': 'Install Nmap and make sure it is on PATH, then retry.',
            }), 400

        actor = session.get('user', 'unknown-admin')
        scan_id = str(uuid.uuid4())

        proc = subprocess.run(
            ['nmap', '-sn', '-oX', '-', network],
            capture_output=True, text=True, timeout=180,
        )

        hosts = []
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(proc.stdout)
            for host in root.findall('host'):
                status_node = host.find('status')
                addr = ''
                for a in host.findall('address'):
                    if a.get('addrtype') == 'ipv4':
                        addr = a.get('addr', '')
                hostname = ''
                hn = host.find('hostnames/hostname')
                if hn is not None:
                    hostname = hn.get('name', '')
                if addr:
                    hosts.append({
                        'ip': addr,
                        'hostname': hostname,
                        'state': status_node.get('state', '') if status_node is not None else '',
                        # flag hosts that already run an ALL EYES X agent
                        'agent_installed': any(
                            d.get('ip') == addr for d in connected_devices.values()
                        ),
                    })
        except Exception as e:
            return jsonify({'error': f'Could not parse nmap output: {e}'}), 500

        conn = get_db()
        conn.execute("""
            INSERT INTO security_scans
            (scan_id, device_id, scan_type, target, status, command, result, parsed_json,
             requested_by, queued_at, completed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (scan_id, 'network', 'discovery', network,
              'completed' if proc.returncode == 0 else 'failed',
              f'nmap -sn {network}', proc.stdout[:20000], json.dumps({'hosts': hosts}),
              actor, datetime.now().isoformat(), datetime.now().isoformat()))
        conn.commit()
        conn.close()

        audit_event(actor, '', 'network_discovery', 'completed',
                    f'{network}: {len(hosts)} host(s) found')
        activity('NETWORK DISCOVERY', network=network, hosts=len(hosts), by=actor)
        add_notification('security',
                         f'DISCOVERY: {len(hosts)} host(s) found on {network} by {actor}')

        return jsonify({
            'success': True,
            'scan_id': scan_id,
            'network': network,
            'hosts': hosts,
            'host_count': len(hosts),
        }), 200
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Discovery scan timed out'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/discovery/scan/<scan_id>/download', methods=['GET'])
@login_required
def api_discovery_download(scan_id):
    """Download a discovery/scan result as a plain-text report."""
    conn = get_db()
    row = conn.execute("SELECT * FROM security_scans WHERE scan_id=?", (scan_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Scan not found'}), 404

    d = dict(row)
    lines = [
        'ALL EYES X - SCAN REPORT',
        '=' * 60,
        f"Scan ID     : {d.get('scan_id')}",
        f"Type        : {d.get('scan_type')}",
        f"Target      : {d.get('target')}",
        f"Status      : {d.get('status')}",
        f"Requested by: {d.get('requested_by')}",
        f"Queued at   : {d.get('queued_at')}",
        f"Completed at: {d.get('completed_at')}",
        '=' * 60,
        '',
    ]
    try:
        parsed = json.loads(d.get('parsed_json') or '{}')
    except Exception:
        parsed = {}

    for h in parsed.get('hosts', []):
        agent = 'yes' if h.get('agent_installed') else 'no'
        lines.append(
            f"{h.get('ip',''):<18} {h.get('hostname','') or '-':<24} "
            f"state={h.get('state','')}  agent={agent}"
        )

    if not parsed.get('hosts'):
        lines.append(d.get('result') or '(no data)')

    body = '\n'.join(lines) + '\n'
    return Response(body, mimetype='text/plain', headers={
        'Content-Disposition': f'attachment; filename="alleyesx-scan-{scan_id[:8]}.txt"',
    })


@app.route('/api/security/nmap/scans', methods=['GET'])
@login_required
def api_nmap_scans():
    limit = min(int(request.args.get('limit', 50)), 200)
    conn = get_db()
    rows = conn.execute("""
        SELECT s.*, d.hostname FROM security_scans s
        LEFT JOIN devices d ON d.id=s.device_id
        ORDER BY s.id DESC LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    scans = []
    for row in rows:
        item = dict(row)
        try:
            item['parsed'] = json.loads(item.get('parsed_json') or '{}')
        except Exception:
            item['parsed'] = {}
        scans.append(item)
    return jsonify({'scans': scans}), 200


@app.route('/api/security/nmap/scan/<scan_id>', methods=['GET'])
@login_required
def api_nmap_scan_detail(scan_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM security_scans WHERE scan_id=?", (scan_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Scan not found'}), 404
    item = dict(row)
    try:
        item['parsed'] = json.loads(item.get('parsed_json') or '{}')
    except Exception:
        item['parsed'] = {}
    return jsonify({'scan': item}), 200


@app.route('/api/security/timeline', methods=['GET'])
@login_required
def api_security_timeline():
    limit = min(int(request.args.get('limit', 100)), 500)
    events = []
    conn = get_db()
    try:
        for r in conn.execute("SELECT timestamp, actor, device_id, action, result, details FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall():
            events.append({**dict(r), 'source': 'audit', 'severity': 'info', 'event_type': r['action']})
        for r in conn.execute("SELECT timestamp, device_id, severity, title, message, status FROM alerts ORDER BY id DESC LIMIT ?", (limit,)).fetchall():
            events.append({**dict(r), 'source': 'alert', 'actor': 'system', 'result': r['status'], 'event_type': 'alert'})
        for r in conn.execute("SELECT queued_at timestamp, requested_by actor, device_id, scan_type, target, status, error FROM security_scans ORDER BY id DESC LIMIT ?", (limit,)).fetchall():
            d = dict(r)
            d.update({'source': 'nmap', 'severity': 'info', 'event_type': 'nmap_scan', 'details': f"{d.get('scan_type')} {d.get('target')} {d.get('error') or ''}"})
            events.append(d)
    finally:
        conn.close()
    events.sort(key=lambda e: str(e.get('timestamp') or ''), reverse=True)
    return jsonify({'events': events[:limit]}), 200


# ============================================================
# API: ANALYTICS
# ============================================================
@app.route('/api/analytics', methods=['GET'])
def api_analytics_data():
    os_count = {}
    country_count = {}
    cpu_data = {}
    ram_data = []
    hourly_activity = {}

    for dev_id, dev in connected_devices.items():
        os_name = dev.get('os', 'Unknown')
        os_count[os_name] = os_count.get(os_name, 0) + 1

        country = dev.get('country', 'Unknown')
        country_count[country] = country_count.get(country, 0) + 1

        cpu = dev.get('cpu', 'Unknown')
        cpu_model = cpu.split('@')[0].strip() if '@' in cpu else cpu[:30]
        cpu_data[cpu_model] = cpu_data.get(cpu_model, 0) + 1

        ram_gb = dev.get('ram_total', 0)
        if ram_gb:
            try:
                ram_data.append(float(ram_gb))
            except:
                pass

        last_seen = dev.get('last_seen', '')
        if last_seen:
            try:
                dt = datetime.fromisoformat(last_seen)
                hour = dt.hour
                hourly_activity[hour] = hourly_activity.get(hour, 0) + 1
            except:
                pass

    os_colors = {
        'Windows': '#00d4ff',
        'Linux': '#22c55e',
        'Darwin': '#8b5cf6',
        'macOS': '#8b5cf6',
        'Android': '#eab308',
        'iOS': '#ef4444'
    }

    timeline_labels = [f'{h:02d}:00' for h in range(24)]
    timeline_values = [hourly_activity.get(h, 0) for h in range(24)]

    ram_buckets = {'0-2GB': 0, '2-4GB': 0, '4-8GB': 0, '8-16GB': 0, '16GB+': 0}
    for r in ram_data:
        if r <= 2: ram_buckets['0-2GB'] += 1
        elif r <= 4: ram_buckets['2-4GB'] += 1
        elif r <= 8: ram_buckets['4-8GB'] += 1
        elif r <= 16: ram_buckets['8-16GB'] += 1
        else: ram_buckets['16GB+'] += 1

    return jsonify({
        'os_chart': {
            'labels': list(os_count.keys()),
            'values': list(os_count.values()),
            'colors': [os_colors.get(l, '#64748b') for l in os_count.keys()]
        },
        'country_chart': {
            'labels': list(country_count.keys()),
            'values': list(country_count.values())
        },
        'cpu_chart': {
            'labels': list(cpu_data.keys()),
            'values': list(cpu_data.values())
        },
        'ram_chart': {
            'labels': list(ram_buckets.keys()),
            'values': list(ram_buckets.values())
        },
        'timeline': {
            'labels': timeline_labels,
            'values': timeline_values
        },
        'total_devices': len(connected_devices),
        'online_devices': sum(1 for d in connected_devices.values() if d.get('status') == 'online'),
        'average_ram': round(sum(ram_data) / len(ram_data), 1) if ram_data else 0
    }), 200


# ============================================================
# API: ALERTS & NOTIFICATIONS
# ============================================================
@app.route('/api/alerts/<int:alert_id>/resolve', methods=['POST'])
def api_alert_resolve(alert_id):
    conn = get_db()
    conn.execute("UPDATE alerts SET status='resolved' WHERE id=?", (alert_id,))
    conn.commit()
    conn.close()
    audit_event(session.get('user', 'system'), '', 'alert_resolved', 'ok', str(alert_id))
    return jsonify({'success': True, 'id': alert_id}), 200


@app.route('/api/alerts/<device_id>', methods=['GET', 'POST'])
def api_alerts(device_id):
    if request.method == 'GET':
        return jsonify({'alerts': get_alerts_from_db(device_id)}), 200
    else:
        try:
            data = request.get_json(force=True)
            alert_type = data.get('type', 'info')
            message = data.get('message', '')
            add_alert_to_db(device_id, alert_type, message)

            socketio.emit('new_alert', {
                'device_id': device_id,
                'alert': {'type': alert_type, 'message': message, 'timestamp': datetime.now().isoformat()}
            })

            return jsonify({'success': True}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 400


@app.route('/api/notifications', methods=['GET'])
def api_get_notifications():
    return jsonify(get_notifications_from_db(50)), 200


@app.route('/api/notify', methods=['POST'])
def api_notify():
    try:
        data = request.get_json(force=True)
        notif_type = data.get('type') or data.get('severity') or 'info'
        message = data.get('message') or data.get('title') or ''
        if not message:
            return jsonify({'error': 'message is required'}), 400
        add_notification(notif_type, message)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ============================================================
# API: GEOLOCATION
# ============================================================
@app.route('/api/geolocation', methods=['GET'])
def api_geolocation():
    locations = []
    for dev_id, dev in connected_devices.items():
        lat = dev.get('latitude', 0)
        lng = dev.get('longitude', 0)
        if lat and lng and lat != 0.0 and lng != 0.0:
            locations.append({
                'id': dev_id,
                'hostname': dev.get('hostname', ''),
                'latitude': lat,
                'longitude': lng,
                'country': dev.get('country', ''),
                'city': dev.get('city', ''),
                'status': dev.get('status', 'offline'),
                'ip': dev.get('public_ip', '')
            })
    return jsonify({'locations': locations}), 200


# ============================================================
# API: FILE TRANSFER
# ============================================================
@app.route('/api/transfer/upload', methods=['POST'])
@login_required
def api_upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    target_device = request.form.get('target_device', 'all')
    transfer_id = str(uuid.uuid4())
    filename = secure_filename(file.filename or 'transfer.bin')
    safe_name = f"{transfer_id}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
    file.save(filepath)
    file_size = os.path.getsize(filepath)

    socketio.emit('file_transfer', {
        'transfer_id': transfer_id,
        'filename': filename,
        'size': file_size,
        'target_device': target_device,
        'timestamp': datetime.now().isoformat()
    })

    return jsonify({
        'success': True,
        'transfer_id': transfer_id,
        'filename': filename,
        'size': file_size,
        'url': f'/api/transfer/download/{transfer_id}/{filename}'
    }), 200


@app.route('/api/transfer/download/<transfer_id>/<filename>')
@login_required
def api_download_file(transfer_id, filename):
    filename = secure_filename(filename or 'transfer.bin')
    safe_name = f"{transfer_id}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/transfer/list', methods=['GET'])
@login_required
def api_transfer_list():
    files = []
    for f in os.listdir(app.config['UPLOAD_FOLDER']):
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f)
        if os.path.isfile(filepath):
            parts = f.split('_', 1)
            transfer_id = parts[0] if len(parts) > 1 else f
            filename = parts[1] if len(parts) > 1 else f
            files.append({
                'transfer_id': transfer_id,
                'filename': filename,
                'size': os.path.getsize(filepath),
                'modified': datetime.fromtimestamp(os.path.getmtime(filepath)).isoformat()
            })
    return jsonify({'transfers': files}), 200


# ============================================================
# API: SYSTEM STATS
# ============================================================
@app.route('/api/system/stats', methods=['GET'])
def api_system_stats():
    try:
        import psutil
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        net = psutil.net_io_counters()

        return jsonify({
            'cpu': cpu_percent,
            'memory': {
                'total': memory.total,
                'available': memory.available,
                'percent': memory.percent
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            },
            'network': {
                'bytes_sent': net.bytes_sent,
                'bytes_recv': net.bytes_recv
            },
            'devices_connected': len(connected_devices),
            'uptime': time.time() - psutil.boot_time()
        }), 200
    except ImportError:
        return jsonify({'devices_connected': len(connected_devices), 'note': 'psutil not available'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 200


# ============================================================
# SOCKET.IO EVENTS
# ============================================================
@socketio.on('connect')
def handle_socket_connect():
    print(f'[WebSocket] Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_socket_disconnect():
    for dev_id, sid in list(connected_clients_sid.items()):
        if sid == request.sid:
            del connected_clients_sid[dev_id]
            if dev_id in connected_devices:
                connected_devices[dev_id]['status'] = 'offline'
                save_device_to_db(connected_devices[dev_id])
                socketio.emit('devices_updated', {
                    'devices': get_device_list_for_dashboard()
                })
            print(f'[WebSocket] Device disconnected: {dev_id[:8]}...')
            break


@socketio.on('register_device')
def handle_register_device(data):
    device_id = data.get('device_id', '')
    if device_id:
        connected_clients_sid[device_id] = request.sid
        join_room(device_id)
        print(f'[WebSocket] Device registered: {device_id[:8]}...')
        emit('registered', {'device_id': device_id, 'status': 'connected'})


@socketio.on('client_heartbeat')
def handle_client_heartbeat(data):
    device_id = data.get('device_id', '')
    if device_id and device_id in connected_devices:
        now_iso = datetime.now().isoformat()
        connected_devices[device_id]['last_seen'] = now_iso
        connected_devices[device_id]['status'] = 'online'
        save_device_to_db(connected_devices[device_id])

        tasks = pending_tasks_queue.get(device_id, [])
        if tasks:
            pending_tasks_queue[device_id] = []
            emit('tasks', {'tasks': tasks})


@socketio.on('touch_event')
def handle_socket_touch_event(data):
    """Route Socket.IO input events into the same queue as POST /api/touch.

    The frontend emits `touch_event` over the socket whenever it is connected,
    but there was no handler for it - so remote mouse/keyboard control silently
    did nothing in the normal (connected) case and only worked when the socket
    was down and the code fell back to HTTP. This makes both paths identical.
    """
    if not data or 'device_id' not in data:
        return
    for field in ('event', 'x', 'y'):
        if field not in data:
            return

    global touch_event_counter
    touch_event_counter += 1
    data['id'] = touch_event_counter
    data['timestamp'] = datetime.utcnow().isoformat()
    touch_event_queues[data['device_id']].append(data)


@socketio.on('command_result')
def handle_command_result(data):
    device_id = data.get('device_id', '')
    command_id = data.get('command_id', '')
    result = data.get('result', '')
    success = data.get('success', True)
    emit('command_completed', {
        'device_id': device_id,
        'command_id': command_id,
        'result': result,
        'success': success
    })


# ============================================================
# STATIC FILES
# ============================================================
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)


@app.route('/manifest.json')
def serve_manifest():
    return send_from_directory('.', 'manifest.json')


# ============================================================
# GLOBAL ERROR HANDLER — Prevents write() before start_response
# ============================================================

@app.errorhandler(500)
def handle_500(e):
    return jsonify({'error': 'Internal server error', 'message': str(e)}), 500

@app.errorhandler(404)
def handle_404(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(Exception)
def handle_exception(e):
    """Catch all unhandled exceptions to prevent Werkzeug write errors."""
    print(f"[ERROR] Unhandled exception: {e}")
    return jsonify({'error': 'Server error', 'message': str(e)}), 500


# ============================================================
# BACKGROUND: CLEANUP OFFLINE DEVICES
# ============================================================
def cleanup_offline_devices():
    while True:
        time.sleep(15)
        now = datetime.now()
        changed = False
        for dev_id, dev in list(connected_devices.items()):
            last_seen = dev.get('last_seen', '')
            if last_seen:
                try:
                    dt = datetime.fromisoformat(last_seen)
                    elapsed = (now - dt).total_seconds()
                    if elapsed > 30 and dev['status'] == 'online':
                        dev['status'] = 'offline'
                        save_device_to_db(dev)
                        # Notify once per device per cooldown window. Without this a
                        # flapping agent flooded the bell with one entry per cycle.
                        last = _offline_notified.get(dev_id, 0)
                        if now.timestamp() - last > OFFLINE_NOTIFY_COOLDOWN:
                            _offline_notified[dev_id] = now.timestamp()
                            add_notification(
                                'security',
                                f'NODE OFFLINE: {dev["hostname"]} lost contact {int(elapsed)}s ago',
                            )
                            activity('DEVICE OFFLINE', device_id=dev_id[:8],
                                     host=dev.get('hostname'), silent_for=f'{int(elapsed)}s')
                        print(f"[-] Device went offline: {dev['hostname']} ({dev_id[:8]}...)")
                        changed = True
                except:
                    pass
        
        if changed:
            socketio.emit('devices_updated', {
                'devices': get_device_list_for_dashboard()
            })


# ============================================================
# MAIN ENTRY POINT — FIXED: eventlet monkey_patch added
# ============================================================
if __name__ == '__main__':
    import eventlet
    eventlet.monkey_patch()
    
    print("""
    ╔══════════════════════════════════════════════╗
    ║                                              ║
    ║     ALL EYES X — Neural Cyber Intelligence   ║
    ║             Server v3.3                      ║
    ║                                              ║
    ║        Server starting on port 5000...        ║
    ║        CORS enabled for all origins           ║
    ║        SQLite persistence active              ║
    ║        Real-time WebSocket sync active        ║
    ║        Touch event queue ready for polling    ║
    ║        Device detail endpoints available      ║
    ║        Hardware inventory store active        ║
    ║                                              ║
    ║     Dashboard: http://meta-f.bittern-adelie.ts.net      ║
    ║     Login:     admin / FRED123               ║
    ║                                              ║
    ╚══════════════════════════════════════════════╝
    """)

    cleanup_thread = threading.Thread(target=cleanup_offline_devices, daemon=True)
    cleanup_thread.start()

    socketio.run(
    app,
    host="0.0.0.0",
    port=5000,
    debug=True,
    allow_unsafe_werkzeug=True
)
