import os
import psycopg2
from seed import seed

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("[Startup] No DATABASE_URL set, skipping seed check.")
else:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM jobs")
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    if count == 0:
        print("[Startup] Empty DB - seeding...")
        seed()
    else:
        print(f"[Startup] DB already has {count} jobs, skipping seed.")
