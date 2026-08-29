"""Inspect the ALL EYES X database schema.

Run from anywhere:

    python server/check_db.py

It always targets the real server database next to this file. Previously it
opened a CWD-relative "aeyes_data.db", so running it from the repo root silently
created an empty database and reported zero tables - which reads exactly like a
broken database when the real one is fine.
"""

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aeyes_data.db")


def main():
    print(f"=== DATABASE: {DB_PATH} ===")

    if not os.path.exists(DB_PATH):
        print("Database does not exist yet.")
        print("Start the server once (python server/app.py) to create it.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]

        print(f"{len(tables)} tables\n")

        for table in tables:
            count = cursor.execute(
                f'SELECT COUNT(*) FROM "{table}"'
            ).fetchone()[0]
            print(f"===== {table} ({count} rows) =====")

            cursor.execute(f'PRAGMA table_info("{table}")')
            for column in cursor.fetchall():
                print(
                    f"  Column: {column[1]} | "
                    f"Type: {column[2]} | "
                    f"Nullable: {not column[3]} | "
                    f"Primary Key: {bool(column[5])}"
                )
            print()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
