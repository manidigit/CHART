# CHART Python Worker

The worker is invoked as a bounded CLI process by Cron; it is not coupled to PHP request latency and does not require an always-on daemon. It claims jobs from MariaDB using row locks and lease expiry.

## Runtime

- Python 3.11+ recommended (verify exact cPanel version before deployment).
- Install dependencies from `requirements.txt` in an isolated virtual environment.
- Configure `CHART_DB_HOST`, `CHART_DB_PORT`, `CHART_DB_NAME`, `CHART_DB_USER`, and `CHART_DB_PASSWORD` as server-side environment variables.
- Invoke `python -m chart_worker.main` from this directory every 15 minutes or at the approved hourly cadence. The ingestion schedule itself should enqueue only due hourly cycles.
- Keep the database user least-privileged; never put credentials in Git or client apps.

## Current implementation boundary

Job claiming, bounded execution, retries, leases, and failure logging are scaffolded. No live provider adapter is enabled. An `INGEST_M15` job fails closed until a provider mapping is verified and a read-only adapter is implemented. This prevents synthetic or mismatched prices from entering the canonical candle store.

## cPanel gate

Before deployment, prove Python CLI availability, virtualenv/pip support, Cron command execution, outbound HTTPS, MariaDB connectivity, CPU/time limits, and log retention. If any critical requirement fails, deploy this worker on a small VPS/managed Python runtime while retaining the PHP API and MariaDB.
