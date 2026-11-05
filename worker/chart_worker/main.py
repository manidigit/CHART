from __future__ import annotations

import logging
import os
import socket
from datetime import datetime, timezone

import mysql.connector

logging.basicConfig(
    level=os.getenv("CHART_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("chart-worker")


def connect():
    return mysql.connector.connect(
        host=os.environ["CHART_DB_HOST"],
        port=int(os.getenv("CHART_DB_PORT", "3306")),
        database=os.environ["CHART_DB_NAME"],
        user=os.environ["CHART_DB_USER"],
        password=os.environ["CHART_DB_PASSWORD"],
        connection_timeout=10,
        autocommit=False,
    )


def claim_one(conn, worker_id: str):
    """Claim one due job. Row lock prevents concurrent workers claiming same job."""
    cur = conn.cursor(dictionary=True)
    cur.execute("START TRANSACTION")
    cur.execute(
        """SELECT id, job_type, instrument_id, payload_json, attempts
           FROM worker_jobs
           WHERE status IN ('QUEUED','RETRY') AND available_at <= UTC_TIMESTAMP(3)
             AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP(3))
           ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED"""
    )
    job = cur.fetchone()
    if not job:
        conn.commit()
        cur.close()
        return None
    cur.execute(
        """UPDATE worker_jobs SET status='RUNNING', attempts=attempts+1,
           locked_by=%s, locked_until=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE)
           WHERE id=%s""",
        (worker_id, job["id"]),
    )
    conn.commit()
    cur.close()
    return job


def process_job(conn, job):
    # Provider adapters must be explicitly configured and verified per instrument.
    # Never manufacture candles or silently substitute another provider/instrument.
    if job["job_type"] == "INGEST_M15":
        raise RuntimeError(
            "No production provider adapter is enabled. Verify instrument/source mapping "
            "and implement its read-only adapter before ingesting market data."
        )
    raise RuntimeError(f"Unsupported job type: {job['job_type']}")


def finish(conn, job_id: int, error: str | None = None):
    cur = conn.cursor()
    if error is None:
        cur.execute(
            """UPDATE worker_jobs SET status='SUCCEEDED', locked_by=NULL, locked_until=NULL,
               last_error=NULL WHERE id=%s""",
            (job_id,),
        )
    else:
        cur.execute(
            """UPDATE worker_jobs SET status=IF(attempts >= 5,'FAILED','RETRY'),
               available_at=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL LEAST(attempts * 5, 60) MINUTE),
               locked_by=NULL, locked_until=NULL, last_error=%s WHERE id=%s""",
            (error[:4000], job_id),
        )
    conn.commit()
    cur.close()


def main():
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    conn = connect()
    try:
        # Bounded batch makes this safe for cPanel Cron execution limits.
        for _ in range(int(os.getenv("CHART_WORKER_MAX_JOBS", "10"))):
            job = claim_one(conn, worker_id)
            if not job:
                break
            try:
                process_job(conn, job)
                finish(conn, job["id"])
            except Exception as exc:
                log.exception("Job %s failed", job["id"])
                finish(conn, job["id"], str(exc))
        log.info("Worker run completed at %s", datetime.now(timezone.utc).isoformat())
    finally:
        conn.close()


if __name__ == "__main__":
    main()
