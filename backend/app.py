from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import sqlite3
import os
import threading
import time
import uuid
from datetime import datetime
import random
import math

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

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


def emit_stats(conn):
    total = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    running = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status='running'"
    ).fetchone()[0]
    failed = conn.execute("SELECT COUNT(*) FROM jobs WHERE status='failed'").fetchone()[
        0
    ]
    completed = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status='completed'"
    ).fetchone()[0]
    socketio.emit(
        "stats_update",
        {
            "total": total,
            "running": running,
            "failed": failed,
            "completed": completed,
        },
    )


def simulate_jobs():
    while True:
        try:
            conn = get_db()
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
                            socketio.emit(
                                "job_update",
                                {
                                    "job_id": job["job_id"],
                                    "status": "queued",
                                    "progress": 0,
                                },
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
                            socketio.emit(
                                "job_update",
                                {
                                    "job_id": job["job_id"],
                                    "status": "failed",
                                    "progress": job["progress"],
                                },
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
                        socketio.emit(
                            "job_update",
                            {
                                "job_id": job["job_id"],
                                "status": "completed",
                                "progress": 100,
                            },
                        )
                else:
                    conn.execute(
                        "UPDATE jobs SET progress=? WHERE job_id=?",
                        (progress, job["job_id"]),
                    )
                    socketio.emit(
                        "job_update",
                        {
                            "job_id": job["job_id"],
                            "status": "running",
                            "progress": progress,
                        },
                    )

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
                    socketio.emit(
                        "job_update",
                        {
                            "job_id": dict(job)["job_id"],
                            "status": "running",
                            "progress": 0,
                        },
                    )

            active_count = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            ).fetchone()[0]

            if active_count < 4:
                template = random.choice(JOB_TEMPLATES)
                client = random.choice(CLIENTS)
                new_job_id = str(uuid.uuid4())[:8]
                conn.execute(
                    """
                    INSERT INTO jobs (job_id, job_name, client, status, progress,
                    retry_count, max_retries, logs, triggered_by, created_at)
                    VALUES (?,?,?,'queued',0,0,2,'','system',?)
                """,
                    (
                        new_job_id,
                        template["name"],
                        client,
                        datetime.utcnow().isoformat(),
                    ),
                )
                socketio.emit(
                    "job_update",
                    {"job_id": new_job_id, "status": "queued", "progress": 0},
                )

            conn.commit()
            emit_stats(conn)
            conn.close()

        except Exception as e:
            print(f"[Simulator] Error: {e}")

        time.sleep(4)


def start_simulator():
    thread = threading.Thread(target=simulate_jobs, daemon=True)
    thread.start()
    print("[Simulator] Started")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/jobs", methods=["GET"])
def get_jobs():
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))
    offset = (page - 1) * limit

    conn = get_db()
    total_count = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    running_count = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status='running'"
    ).fetchone()[0]
    failed_count = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status='failed'"
    ).fetchone()[0]
    completed_count = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status='completed'"
    ).fetchone()[0]

    jobs = conn.execute(
        """
        SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?
    """,
        (limit, offset),
    ).fetchall()
    conn.close()

    return jsonify(
        {
            "jobs": [dict(job) for job in jobs],
            "total": total_count,
            "running": running_count,
            "failed": failed_count,
            "completed": completed_count,
            "page": page,
            "pages": math.ceil(total_count / limit),
        }
    )


@app.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id):
    conn = get_db()
    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    conn.close()
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(dict(job))


if __name__ == "__main__":
    init_db()
    print("[Backend] Database initialized")
    start_simulator()
    port = int(os.environ.get("PORT", 5001))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
