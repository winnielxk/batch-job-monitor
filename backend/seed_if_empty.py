import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "jobs.db")

conn = sqlite3.connect(DB_PATH)
count = (
    conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    if conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'"
    ).fetchone()
    else 0
)
conn.close()

if count == 0:
    print("[Startup] Empty DB — seeding...")
    import seed

    seed.seed()
else:
    print(f"[Startup] DB has {count} jobs — skipping seed")
