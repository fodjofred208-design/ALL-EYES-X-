"""
ALL EYES X - database initializer.

This used to carry its own copy of the schema, which had drifted badly from the
one app.py actually creates at startup: it was missing 14 tables the backend
reads (command_results, audit_log, security_scans, software_inventory, os_info,
processor_info, memory_info, gpu_info, storage_devices, network_interfaces,
peripherals, hardware_info, remote_sessions, device_preferences) and 5 columns on
devices (registered_at, deleted, connected, sessions, data_usage).

Running it therefore produced a database the Command Center could not read - the
original "the database does not contain what the Command Center requests" symptom.

There is now exactly one schema, owned by app.py. This module just invokes it, so
the two can never drift again.
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


def initialize_database(db_path=None):
    """Create or migrate the database using the single canonical schema.

    db_path overrides the default location (used by tests); otherwise the real
    server database next to this file is used.
    """
    import app as server_app

    if db_path:
        server_app.DB_PATH = db_path

    server_app.init_db()
    server_app.dedupe_devices()

    import sqlite3
    conn = sqlite3.connect(server_app.DB_PATH)
    try:
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )]
    finally:
        conn.close()

    print(f"Database ready at {server_app.DB_PATH}")
    print(f"{len(tables)} tables:")
    for t in tables:
        print(f"  - {t}")
    return tables


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    initialize_database(target)
