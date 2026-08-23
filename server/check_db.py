import sqlite3

conn = sqlite3.connect("aeyes_data.db")
cursor = conn.cursor()

cursor.execute("""
    SELECT name
    FROM sqlite_master
    WHERE type='table'
    ORDER BY name
""")

tables = [row[0] for row in cursor.fetchall()]

print("=== DATABASE TABLES ===")

for table in tables:
    print(f"\n===== {table} =====")

    cursor.execute(f'PRAGMA table_info("{table}")')

    for column in cursor.fetchall():
        print(
            f"Column: {column[1]} | "
            f"Type: {column[2]} | "
            f"Nullable: {not column[3]} | "
            f"Primary Key: {column[5]}"
        )

conn.close()