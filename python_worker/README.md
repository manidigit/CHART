# Optional Python / FastAPI ML Inference Worker

This service provides **optional** server-side statistical and deep-learning execution (`statsmodels` ARIMA, Meta `prophet`, 2-layer PyTorch LSTM with 50-pass MC Dropout, and `pytorch-forecasting` Temporal Fusion Transformer) behind a clean HTTP JSON contract consumed by:

- Web client (`ForecastWorkerClient.js`)
- Android app (`ForecastWorkerClient.kt`)
- cPanel PHP API (`ForecastEnginePhp::probeRemoteWorker`)

## Shared cPanel Hosting Notice

If your deployment runs exclusively on shared cPanel hosting without Python/ASGI support, **no setup here is required**:
- Web runs all 4 native JS plugins directly in the browser.
- Android runs all 4 native Kotlin plugins on-device.
- PHP runs all 4 native PHP algorithms in `host_subdomain/api/v1/forecast/NativeModelsPhp.php` without external dependencies.
- When `worker_url` is empty or unreachable, all clients gracefully fall back to native execution without disrupting charts or forecasts.

## Running Locally or on a VPS / Docker Host

```bash
cd python_worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
```

Configure the base URL (for example `https://worker.example.com`) inside Chart Intelligence **Settings → Forecast Worker URL**.
