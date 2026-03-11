from flask import Flask, jsonify
from flask_cors import CORS
import sqlite3
import os
import threading
import time
import uuid
from datetime import datetime
import random

app = Flask(__name__)
CORS(app)

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


def simulate_jobs():
    while True:
        try:
            conn = get_db()

            # Advance running jobs
            running = conn.execute(
                "SELECT * FROM jobs WHERE status = 'running'"
            ).fetchall()

            for job in running:
                job = dict(job)
                progress = job["progress"] + random.randint(3, 12)

                if progress >= 100:
                    if random.random() < 0.12:
                        err_key = random.choice(list(ERROR_TYPES.keys()))
                        if job["retry_count"] < job["max_retries"]:
                            conn.execute(
                                """
                                UPDATE jobs SET status='queued', progress=0,
                                start_time=NULL, error_message=NULL, error_type=NULL,
                                retry_count=retry_count+1
                                WHERE job_id=?
                            """,
                                (job["job_id"],),
                            )
                        else:
                            conn.execute(
                                """
                                UPDATE jobs SET status='failed', progress=?,
                                end_time=?, error_message=?, error_type=?
                                WHERE job_id=?
                            """,
                                (
                                    job["progress"],
                                    datetime.utcnow().isoformat(),
                                    ERROR_TYPES[err_key],
                                    err_key,
                                    job["job_id"],
                                ),
                            )
                    else:
                        start = datetime.fromisoformat(job["start_time"])
                        duration = int((datetime.utcnow() - start).total_seconds())
                        conn.execute(
                            """
                            UPDATE jobs SET status='completed', progress=100,
                            end_time=?, duration=?
                            WHERE job_id=?
                        """,
                            (datetime.utcnow().isoformat(), duration, job["job_id"]),
                        )
                else:
                    conn.execute(
                        "UPDATE jobs SET progress=? WHERE job_id=?",
                        (progress, job["job_id"]),
                    )

            # Pick up queued jobs (max 5 running at once)
            running_count = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status='running'"
            ).fetchone()[0]

            if running_count < 5:
                queued = conn.execute(
                    """
                    SELECT * FROM jobs WHERE status='queued'
                    ORDER BY created_at ASC LIMIT ?
                """,
                    (5 - running_count,),
                ).fetchall()

                for job in queued:
                    conn.execute(
                        """
                        UPDATE jobs SET status='running', start_time=?, progress=?
                        WHERE job_id=?
                    """,
                        (
                            datetime.utcnow().isoformat(),
                            random.randint(1, 5),
                            dict(job)["job_id"],
                        ),
                    )

            # Spawn new jobs if queue is low
            active_count = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            ).fetchone()[0]

            if active_count < 4:
                template = random.choice(JOB_TEMPLATES)
                client = random.choice(CLIENTS)
                conn.execute(
                    """
                    INSERT INTO jobs (job_id, job_name, client, status, progress,
                    retry_count, max_retries, logs, triggered_by, created_at)
                    VALUES (?,?,?,'queued',0,0,2,'','system',?)
                """,
                    (
                        str(uuid.uuid4())[:8],
                        template["name"],
                        client,
                        datetime.utcnow().isoformat(),
                    ),
                )

            conn.commit()
            conn.close()

        except Exception as e:
            print(f"[Simulator] Error: {e}")

        time.sleep(4)


def start_simulator():
    thread = threading.Thread(target=simulate_jobs, daemon=True)
    thread.start()
    print("[Simulator] Started")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
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
        """
    )
    conn.commit()
    conn.close()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/jobs", methods=["GET"])
def get_jobs():
    conn = get_db()
    jobs = conn.execute(
        """
        SELECT * FROM jobs
        ORDER BY created_at DESC
    """
    ).fetchall()
    conn.close()
    return jsonify([dict(job) for job in jobs])


if __name__ == "__main__":
    init_db()
    print("[Backend] Database initialized")
    start_simulator()
    app.run(host="0.0.0.0", port=5001, debug=False)
