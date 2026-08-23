import os
import sqlite3
from datetime import datetime


# ============================================================
# ALL EYES X — DATABASE INITIALIZER
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "aeyes_data.db")


def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    print("=" * 70)
    print("ALL EYES X — DATABASE INITIALIZATION")
    print("=" * 70)
    print(f"Database: {DB_PATH}")

    conn = connect_db()

    try:
        # ========================================================
        # DEVICES
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                hostname TEXT,
                ip TEXT,
                mac TEXT,
                os TEXT,
                os_name TEXT,
                os_version TEXT,
                architecture TEXT,
                cpu TEXT,
                ram TEXT,
                ram_total REAL,
                public_ip TEXT,
                country TEXT,
                city TEXT,
                latitude REAL,
                longitude REAL,
                status TEXT DEFAULT 'offline',
                last_seen TEXT,
                created_at TEXT
            )
        """)

        # ========================================================
        # TELEMETRY
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,

                cpu REAL DEFAULT 0,
                ram REAL DEFAULT 0,
                disk REAL DEFAULT 0,

                net_sent REAL DEFAULT 0,
                net_recv REAL DEFAULT 0,

                firewall INTEGER DEFAULT 0,
                antivirus INTEGER DEFAULT 0,

                open_ports TEXT DEFAULT '',

                boot_time TEXT,
                logged_user TEXT,

                gpu TEXT DEFAULT '',
                wifi TEXT DEFAULT '',
                battery REAL DEFAULT 0,

                malware_detected INTEGER DEFAULT 0,

                updated_at TEXT NOT NULL,

                FOREIGN KEY (device_id)
                    REFERENCES devices(id)
                    ON DELETE CASCADE
            )
        """)

        # ========================================================
        # TRAFFIC SAMPLES
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS traffic_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                ts TEXT NOT NULL,
                upload REAL DEFAULT 0,
                download REAL DEFAULT 0
            )
        """)

        # ========================================================
        # ALERTS
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                severity TEXT DEFAULT 'info',
                title TEXT,
                message TEXT,
                category TEXT DEFAULT 'system',
                status TEXT DEFAULT 'open',
                timestamp TEXT NOT NULL
            )
        """)

        # ========================================================
        # NOTIFICATIONS
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT DEFAULT 'info',
                title TEXT,
                message TEXT,
                status TEXT DEFAULT 'open',
                timestamp TEXT NOT NULL
            )
        """)

        # ========================================================
        # AUTH ATTEMPTS
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                ip TEXT,
                success INTEGER DEFAULT 0,
                remote INTEGER DEFAULT 0,
                timestamp TEXT NOT NULL
            )
        """)

        # ========================================================
        # DAILY STATS
        # ========================================================
        conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                avg_cpu REAL DEFAULT 0,
                alerts INTEGER DEFAULT 0,
                bandwidth REAL DEFAULT 0,
                score REAL DEFAULT 0
            )
        """)

        # ========================================================
        # INDEXES
        # ========================================================

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_telemetry_device
            ON telemetry(device_id)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_telemetry_updated
            ON telemetry(updated_at)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_traffic_ts
            ON traffic_samples(ts)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_devices_status
            ON devices(status)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_devices_last_seen
            ON devices(last_seen)
        """)

        conn.commit()

        print("\nDatabase initialized successfully.")
        print("\nTables:")

        rows = conn.execute("""
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
        """).fetchall()

        for row in rows:
            print("  ✓", row["name"])

    except Exception as e:
        conn.rollback()
        print("\nDATABASE INITIALIZATION FAILED")
        print(repr(e))
        raise

    finally:
        conn.close()

    print("\nDatabase ready.")
    print("=" * 70)


if __name__ == "__main__":
    initialize_database()