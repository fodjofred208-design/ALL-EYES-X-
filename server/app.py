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
import threading
import base64
import subprocess
import socket
import platform
import sqlite3
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "aeyes_data.db")
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from collections import defaultdict
from flask import (
    Flask, render_template, request, jsonify, session,
    redirect, url_for, send_file, Response, send_from_directory
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

# ============================================================
# CONFIGURATION
# ============================================================

SECRET_KEY = os.environ.get("SECRET_KEY", "aeyes_x_s3cr3t_k3y_2026")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "FRED123")

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
    """)
    # Migration: add 'deleted' column to existing databases
    cols = [r[1] for r in conn.execute("PRAGMA table_info(devices)").fetchall()]
    if 'deleted' not in cols:
        conn.execute("ALTER TABLE devices ADD COLUMN deleted INTEGER DEFAULT 0")
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

def add_alert_to_db(device_id, alert_type, message):
    conn = get_db()
    conn.execute(
        "INSERT INTO alerts (device_id, type, message, timestamp) VALUES (?,?,?,?)",
        (device_id, alert_type, message, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()

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

# ============================================================
# In-memory cache
# ============================================================
connected_devices = load_devices_from_db()
connected_clients_sid = {}
pending_tasks_queue = {}
touch_event_queues = defaultdict(list)
touch_event_counter = 0
latest_screenshots = {}
latest_webcam_frames = {}

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

        if username == ADMIN_USER and password == ADMIN_PASS:
            session['user'] = username
            session['login_time'] = datetime.now().isoformat()
            if request.is_json:
                return jsonify({'success': True, 'redirect': url_for('loading')})
            return redirect(url_for('loading'))

        if request.is_json:
            return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
        return render_template('login.html', error='Invalid credentials')

    return render_template('login.html')


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
            'os': dev.get('os', 'Unknown'),
            'os_name': dev.get('os', 'Unknown'),
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

                # IMPORTANT:
                # Use the SAME database file used by your application.
                db_path = Path(r"C:\Users\WINDOWS 10\aeyes_data.db")

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
            })

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
            ORDER BY ts DESC
            LIMIT 1
        """)

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
            ORDER BY ts ASC
            LIMIT 30
        """)

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
            WHERE ram IS NOT NULL
            ORDER BY updated_at ASC
            LIMIT 30
        """)

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
            WHERE disk IS NOT NULL
            ORDER BY updated_at ASC
            LIMIT 30
        """)

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

        charts_payload = {

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
            ORDER BY updated_at DESC
            LIMIT 1
        """)

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
        # ============================================================

        security_score = 0

        if telemetry_rows:

            telemetry = telemetry_rows[0]

            firewall = bool(
                telemetry.get('firewall')
            )

            antivirus = bool(
                telemetry.get('antivirus')
            )

            malware = bool(
                telemetry.get('malware_detected')
            )

            security_score = 100

            if not firewall:
                security_score -= 20

            if not antivirus:
                security_score -= 20

            if malware:
                security_score -= 40

            security_score = max(
                0,
                min(100, security_score)
            )

        if security_score >= 90:

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

        }), 500# ============================================================
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
        print(f"[{status}] Command {command_id[:8]}... from {hostname}")

        add_notification('command', f'VECTOR RESULT from {hostname}: {result_text[:120]}')

        if not success:
            add_alert_to_db(device_id, 'error', f'Command {command_id[:8]} failed: {result_text[:100]}')

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
            
            conn = get_db()
            conn.execute("DELETE FROM screenshots WHERE device_id=?", (device_id,))
            conn.execute(
                "INSERT INTO screenshots (device_id, image_data, timestamp) VALUES (?,?,?)",
                (device_id, image_b64, datetime.now().isoformat())
            )
            conn.commit()
            conn.close()
            
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
            
            conn = get_db()
            conn.execute("DELETE FROM webcam_frames WHERE device_id=?", (device_id,))
            conn.execute(
                "INSERT INTO webcam_frames (device_id, image_data, timestamp) VALUES (?,?,?)",
                (device_id, image_b64, datetime.now().isoformat())
            )
            conn.commit()
            conn.close()
            
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


@app.route('/api/webcam/<device_id>/start', methods=['POST'])
def start_webcam(device_id):
    data = request.get_json() or {}
    camera = data.get('camera', 'front')
    interval = data.get('interval', 200)
    
    socketio.emit('webcam_command', {
        'device_id': device_id,
        'command': 'start',
        'camera': camera,
        'interval': interval,
    })
    
    return jsonify({'status': 'started', 'device_id': device_id})


@app.route('/api/webcam/<device_id>/stop', methods=['POST'])
def stop_webcam(device_id):
    socketio.emit('webcam_command', {
        'device_id': device_id,
        'command': 'stop',
    })
    
    return jsonify({'status': 'stopped', 'device_id': device_id})


@app.route('/api/webcam/<device_id>/switch', methods=['POST'])
def switch_webcam(device_id):
    data = request.get_json() or {}
    camera = data.get('camera', 'front')
    
    socketio.emit('webcam_command', {
        'device_id': device_id,
        'command': 'switch',
        'camera': camera,
    })
    
    return jsonify({'status': 'switched', 'device_id': device_id})


# ============================================================
# API: DEVICES
# ============================================================
@app.route('/api/devices', methods=['GET'])
def api_devices():
    return api_dashboard()


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
                cpu_data.get('brand', ''),
                cpu_data.get('model', ''),
                cpu_data.get('core_count', 0),
                cpu_data.get('logical_threads', 0),
                cpu_data.get('clock_speed', ''),
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
                conn.execute("""
                    INSERT INTO gpu_info (device_id, name, manufacturer, dedicated_memory, driver_version, current_usage)
                    VALUES (?,?,?,?,?,?)
                """, (
                    device_id,
                    gpu.get('name', ''),
                    gpu.get('manufacturer', ''),
                    gpu.get('dedicated_memory', ''),
                    gpu.get('driver_version', ''),
                    gpu.get('current_usage', 0.0),
                ))
        
        storage_list = data.get('storage', [])
        if storage_list:
            conn.execute("DELETE FROM storage_devices WHERE device_id=?", (device_id,))
            for disk in storage_list:
                conn.execute("""
                    INSERT INTO storage_devices (device_id, name, drive_type, capacity, used, free, health)
                    VALUES (?,?,?,?,?,?,?)
                """, (
                    device_id,
                    disk.get('name', ''),
                    disk.get('drive_type', ''),
                    disk.get('capacity', ''),
                    disk.get('used', ''),
                    disk.get('free', ''),
                    disk.get('health', ''),
                ))
        
        net_list = data.get('network_interfaces', [])
        if net_list:
            conn.execute("DELETE FROM network_interfaces WHERE device_id=?", (device_id,))
            for netif in net_list:
                conn.execute("""
                    INSERT INTO network_interfaces (device_id, name, interface_type, ipv4, ipv6, mac, gateway, dns, speed, status)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                """, (
                    device_id,
                    netif.get('name', ''),
                    netif.get('interface_type', ''),
                    netif.get('ipv4', ''),
                    netif.get('ipv6', ''),
                    netif.get('mac', ''),
                    netif.get('gateway', ''),
                    netif.get('dns', ''),
                    netif.get('speed', ''),
                    netif.get('status', ''),
                ))
        
        peri_list = data.get('peripherals', [])
        if peri_list:
            conn.execute("DELETE FROM peripherals WHERE device_id=?", (device_id,))
            for peri in peri_list:
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
def api_upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    target_device = request.form.get('target_device', 'all')
    transfer_id = str(uuid.uuid4())
    filename = file.filename
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
def api_download_file(transfer_id, filename):
    safe_name = f"{transfer_id}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True, download_name=filename)
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/transfer/list', methods=['GET'])
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
                        add_notification('security', f'NODE OFFLINE: {dev["hostname"]} — No heartbeat for {int(elapsed)}s')
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
