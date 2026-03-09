import sqlite3
import os
import uuid
import random
from datetime import datetime, timedelta

DB_PATH = os.environ.get("DB_PATH", "jobs.db")

CLIENTS = ["Acme Corp", "TechCo Inc", "RetailMart", "Warehouse LLC", "FinServ Group"]

JOB_TEMPLATES = [
    {"name": "Daily Sales Report", "duration_range": (60, 300)},
    {"name": "Customer Data Sync", "duration_range": (30, 180)},
    {"name": "Invoice Processing", "duration_range": (120, 600)},
    {"name": "Inventory Update", "duration_range": (45, 240)},
    {"name": "Payment Reconciliation", "duration_range": (90, 480)},
    {"name": "Data Backup", "duration_range": (180, 900)},
    {"name": "System Health Check", "duration_range": (15, 60)},
    {"name": "Generate Analytics Dashboard", "duration_range": (60, 360)},
    {"name": "ETL Pipeline Run", "duration_range": (120, 720)},
    {"name": "End-of-Day Settlement", "duration_range": (300, 1200)},
    {"name": "Customer Report Export", "duration_range": (60, 300)},
    {"name": "Archive Old Records", "duration_range": (90, 540)},
]

ERROR_TYPES = {
    "timeout": "Job exceeded 10 minute execution limit",
    "resource_error": "Insufficient memory available",
    "dependency_error": "Required prerequisite job failed",
    "io_error": "Database connection timeout",
}

def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE NOT NULL,
            job_name TEXT NOT NULL,
            client TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            start_time TEXT,
            end_time TEXT,
            duration INTEGER,
            progress INTEGER DEFAULT 0,
            error_message TEXT,
            error_type TEXT,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 2,
            depends_on_job_id TEXT,
            logs TEXT DEFAULT '',
            triggered_by TEXT DEFAULT 'system',
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("DELETE FROM jobs")

    now = datetime.utcnow()
    jobs = []

    for i in range(60):
        template = random.choice(JOB_TEMPLATES)
        client = random.choice(CLIENTS)
        created_at = now - timedelta(hours=random.randint(0, 48), minutes=random.randint(0, 59))
        status = random.choices(
            ["completed", "failed", "running", "queued"],
            weights=[55, 15, 20, 10]
        )[0]

        start_time = None
        end_time = None
        duration = None
        progress = 0
        error_message = None
        error_type = None
        retry_count = 0

        if status == "completed":
            start_time = created_at + timedelta(seconds=random.randint(5, 30))
            duration = random.randint(*template["duration_range"])
            end_time = start_time + timedelta(seconds=duration)
            progress = 100

        elif status == "failed":
            start_time = created_at + timedelta(seconds=random.randint(5, 30))
            duration = random.randint(10, template["duration_range"][0])
            end_time = start_time + timedelta(seconds=duration)
            progress = random.randint(10, 80)
            err_key = random.choice(list(ERROR_TYPES.keys()))
            error_type = err_key
            error_message = ERROR_TYPES[err_key]
            retry_count = random.randint(0, 2)

        elif status == "running":
            start_time = created_at + timedelta(seconds=random.randint(5, 30))
            progress = random.randint(5, 95)

        elif status == "queued":
            progress = 0

        jobs.append((
            str(uuid.uuid4())[:8],
            template["name"],
            client,
            status,
            start_time.isoformat() if start_time else None,
            end_time.isoformat() if end_time else None,
            duration,
            progress,
            error_message,
            error_type,
            retry_count,
            2,
            None,
            "",
            "system",
            created_at.isoformat(),
        ))

    conn.executemany("""
        INSERT INTO jobs (
            job_id, job_name, client, status,
            start_time, end_time, duration, progress,
            error_message, error_type, retry_count, max_retries,
            depends_on_job_id, logs, triggered_by, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, jobs)

    conn.commit()
    conn.close()
    print(f"[Seed] Inserted {len(jobs)} jobs into {DB_PATH}")

if __name__ == "__main__":
    seed()