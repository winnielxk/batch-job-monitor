import eventlet

eventlet.monkey_patch()
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import psycopg2
import os
import threading
import time
import uuid
from datetime import datetime
import random
import math

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    logger=True,
    engineio_logger=True,
)

DATABASE_URL = os.environ.get("DATABASE_URL")

CLIENTS = ["Acme Corp", "TechCo Inc", "RetailMart", "Warehouse LLC", "FinServ Group"]

ERROR_TYPES = {
    "timeout": "Job exceeded 10 minute execution limit",
    "resource_error": "Insufficient memory available",
    "dependency_error": "Required prerequisite job failed",
    "io_error": "Database connection timeout",
}


# ── DB helpers ────────────────────────────────────────────────────────────────


def get_db():
    return psycopg2.connect(DATABASE_URL)


def fetchall_as_dicts(cursor):
    cols = [desc[0] for desc in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def fetchone_as_dict(cursor):
    cols = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    return dict(zip(cols, row)) if row else None


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
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
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            task_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            schedule TEXT NOT NULL,
            scheduled_time TEXT NOT NULL,
            duration_min INTEGER NOT NULL,
            duration_max INTEGER NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            prerequisite_task_id TEXT,
            description TEXT,
            created_at TEXT NOT NULL
        )
    """
    )
    conn.commit()
    cur.close()
    conn.close()


# ── Stats emit ────────────────────────────────────────────────────────────────


def emit_stats(conn):
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM jobs")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='running'")
    running = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='failed'")
    failed = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='completed'")
    completed = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='cancelled'")
    cancelled = cur.fetchone()[0]
    cur.close()
    socketio.emit(
        "stats_update",
        {
            "total": total,
            "running": running,
            "failed": failed,
            "completed": completed,
            "cancelled": cancelled,
        },
    )


# ── Simulator ─────────────────────────────────────────────────────────────────


def simulate_jobs():
    while True:
        try:
            conn = get_db()
            cur = conn.cursor()
            now = datetime.utcnow()

            # ── 1. Advance running jobs ────────────────────────────────────
            cur.execute("SELECT * FROM jobs WHERE status = 'running'")
            running_jobs = fetchall_as_dicts(cur)

            for job in running_jobs:
                cur.execute("SELECT status FROM jobs WHERE job_id=%s", (job["job_id"],))
                current = cur.fetchone()
                if not current or current[0] != "running":
                    continue

                progress = job["progress"] + random.randint(3, 12)

                if progress >= 100:
                    if random.random() < 0.12:
                        err_key = random.choice(list(ERROR_TYPES.keys()))
                        if job["retry_count"] < job["max_retries"]:
                            cur.execute(
                                """
                                UPDATE jobs SET status='queued', progress=0,
                                start_time=NULL, error_message=NULL, error_type=NULL,
                                retry_count=retry_count+1
                                WHERE job_id=%s
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
                            cur.execute(
                                """
                                UPDATE jobs SET status='failed', progress=%s,
                                end_time=%s, error_message=%s, error_type=%s
                                WHERE job_id=%s
                            """,
                                (
                                    job["progress"],
                                    now.isoformat(),
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
                        duration = int((now - start).total_seconds())
                        cur.execute(
                            """
                            UPDATE jobs SET status='completed', progress=100,
                            end_time=%s, duration=%s
                            WHERE job_id=%s
                        """,
                            (now.isoformat(), duration, job["job_id"]),
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
                    cur.execute(
                        "UPDATE jobs SET progress=%s WHERE job_id=%s",
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

            # ── 2. Promote queued jobs (cap at 5 running) ──────────────────
            cur.execute("SELECT COUNT(*) FROM jobs WHERE status='running'")
            running_count = cur.fetchone()[0]

            if running_count < 5:
                cur.execute(
                    """
                    SELECT * FROM jobs WHERE status='queued'
                    ORDER BY created_at ASC LIMIT %s
                """,
                    (5 - running_count,),
                )
                for job in fetchall_as_dicts(cur):
                    cur.execute(
                        """
                        UPDATE jobs SET status='running', start_time=%s, progress=%s
                        WHERE job_id=%s
                    """,
                        (now.isoformat(), random.randint(1, 5), job["job_id"]),
                    )
                    socketio.emit(
                        "job_update",
                        {
                            "job_id": job["job_id"],
                            "status": "running",
                            "progress": 0,
                        },
                    )

            # ── 3. Spawn new jobs from tasks table ─────────────────────────
            cur.execute(
                "SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running')"
            )
            active_count = cur.fetchone()[0]

            if active_count < 6:
                cur.execute("SELECT * FROM tasks WHERE enabled = TRUE")
                all_tasks = fetchall_as_dicts(cur)

                if not all_tasks:
                    conn.commit()
                    cur.close()
                    conn.close()
                    time.sleep(4)
                    continue

                cur.execute(
                    """
                    SELECT DISTINCT ON (job_name) job_name, status
                    FROM jobs
                    ORDER BY job_name, created_at DESC
                """
                )
                recent_status = {row[0]: row[1] for row in cur.fetchall()}

                cur.execute(
                    """
                    SELECT job_name FROM jobs
                    WHERE status IN ('queued', 'running')
                """
                )
                already_active = {row[0] for row in cur.fetchall()}

                eligible = []
                for task in all_tasks:
                    if task["name"] in already_active:
                        continue
                    prereq_id = task["prerequisite_task_id"]
                    if prereq_id:
                        cur.execute(
                            "SELECT name FROM tasks WHERE task_id = %s", (prereq_id,)
                        )
                        row = cur.fetchone()
                        if row:
                            prereq_name = row[0]
                            if recent_status.get(prereq_name) != "completed":
                                continue
                    sched_hhmm = task["scheduled_time"]
                    sched_h, sched_m = map(int, sched_hhmm.split(":"))
                    floor_time = now.replace(
                        hour=sched_h, minute=sched_m, second=0, microsecond=0
                    )
                    if now < floor_time:
                        continue
                    eligible.append(task)

                if eligible:
                    task = random.choice(eligible)
                    new_job_id = str(uuid.uuid4())[:8]
                    cur.execute(
                        """
                        INSERT INTO jobs (
                            job_id, job_name, client, status, progress,
                            retry_count, max_retries, logs, triggered_by, created_at
                        ) VALUES (%s,%s,%s,'queued',0,0,2,'','system',%s)
                    """,
                        (
                            new_job_id,
                            task["name"],
                            random.choice(CLIENTS),
                            now.isoformat(),
                        ),
                    )
                    socketio.emit(
                        "job_update",
                        {
                            "job_id": new_job_id,
                            "status": "queued",
                            "progress": 0,
                        },
                    )

            conn.commit()
            emit_stats(conn)
            cur.close()
            conn.close()

        except Exception as e:
            print(f"[Simulator] Error: {e}")

        time.sleep(4)


def start_simulator():
    thread = threading.Thread(target=simulate_jobs, daemon=True)
    thread.start()
    print("[Simulator] Started")


# ── Routes ────────────────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/jobs", methods=["GET"])
def get_jobs():
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))
    offset = (page - 1) * limit

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM jobs")
    total_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='running'")
    running_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='failed'")
    failed_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='completed'")
    completed_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM jobs WHERE status='cancelled'")
    cancelled_count = cur.fetchone()[0]

    filters = []
    params = []
    status_filter = request.args.get("status")
    client_filter = request.args.get("client")
    if status_filter:
        filters.append("status=%s")
        params.append(status_filter)
    if client_filter:
        filters.append("client=%s")
        params.append(client_filter)

    where = ("WHERE " + " AND ".join(filters)) if filters else ""

    cur.execute(f"SELECT COUNT(*) FROM jobs {where}", params)
    filtered_total = cur.fetchone()[0]

    cur.execute(
        f"SELECT * FROM jobs {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
        params + [limit, offset],
    )
    jobs = fetchall_as_dicts(cur)
    cur.close()
    conn.close()

    return jsonify(
        {
            "jobs": jobs,
            "total": total_count,
            "filtered_total": filtered_total,
            "running": running_count,
            "failed": failed_count,
            "completed": completed_count,
            "cancelled": cancelled_count,
            "page": page,
            "pages": math.ceil(filtered_total / limit) if filtered_total else 1,
        }
    )


@app.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM jobs WHERE job_id = %s", (job_id,))
    job = fetchone_as_dict(cur)
    cur.close()
    conn.close()
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/jobs/<job_id>/cancel", methods=["POST"])
def cancel_job(job_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE jobs SET status='cancelled', end_time=%s,
        error_message='Cancelled by operator'
        WHERE job_id=%s AND status IN ('running','queued')
    """,
        (datetime.utcnow().isoformat(), job_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    socketio.emit(
        "job_update", {"job_id": job_id, "status": "cancelled", "progress": 0}
    )
    return jsonify({"status": "cancelled"})


@app.route("/tasks", methods=["GET"])
def get_tasks():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks ORDER BY scheduled_time ASC")
    tasks = fetchall_as_dicts(cur)
    cur.close()
    conn.close()
    return jsonify(tasks)


@app.route("/tasks/<task_id>/start", methods=["POST"])
def start_task(task_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,))
    task = fetchone_as_dict(cur)
    if not task:
        cur.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    new_job_id = str(uuid.uuid4())[:8]
    now = datetime.utcnow().isoformat()
    cur.execute(
        """
        INSERT INTO jobs (
            job_id, job_name, client, status, progress,
            retry_count, max_retries, logs, triggered_by, created_at
        ) VALUES (%s,%s,%s,'queued',0,0,2,'','operator',%s)
    """,
        (new_job_id, task["name"], random.choice(CLIENTS), now),
    )
    conn.commit()
    cur.close()
    conn.close()
    socketio.emit(
        "job_update", {"job_id": new_job_id, "status": "queued", "progress": 0}
    )
    return jsonify({"job_id": new_job_id, "status": "queued"})


@app.route("/tasks/<task_id>/cancel", methods=["POST"])
def cancel_task(task_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,))
    task = fetchone_as_dict(cur)
    if not task:
        cur.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    cur.execute(
        """
        UPDATE jobs SET status='cancelled', end_time=%s,
        error_message='Cancelled by operator'
        WHERE job_name=%s AND status IN ('running','queued')
    """,
        (datetime.utcnow().isoformat(), task["name"]),
    )
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"status": "cancelled"})


@app.route("/tasks/<task_id>/schedule", methods=["PATCH"])
def update_task_schedule(task_id):
    data = request.get_json()
    scheduled_time = data.get("scheduled_time")
    enabled = data.get("enabled")

    if not scheduled_time and enabled is None:
        return jsonify({"error": "Nothing to update"}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,))
    task = fetchone_as_dict(cur)
    if not task:
        cur.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    if scheduled_time:
        cur.execute(
            "UPDATE tasks SET scheduled_time=%s WHERE task_id=%s",
            (scheduled_time, task_id),
        )
    if enabled is not None:
        cur.execute(
            "UPDATE tasks SET enabled=%s WHERE task_id=%s",
            (enabled, task_id),
        )

    conn.commit()
    cur.execute("SELECT * FROM tasks WHERE task_id = %s", (task_id,))
    updated = fetchone_as_dict(cur)
    cur.close()
    conn.close()
    return jsonify(updated)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("[Backend] Database initialized")
    start_simulator()
    port = int(os.environ.get("PORT", 5001))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
