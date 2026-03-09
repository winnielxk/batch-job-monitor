from flask import Flask, jsonify
from flask_cors import CORS
import sqlite3
import os

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
    jobs = conn.execute("""
        SELECT * FROM jobs
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(job) for job in jobs])


if __name__ == "__main__":
    init_db()
    print("[Backend] Database initialized")
    app.run(host="0.0.0.0", port=5001, debug=False)