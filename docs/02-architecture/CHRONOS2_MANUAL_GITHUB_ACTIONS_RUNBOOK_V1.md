# CHART — Chronos-2 Manual Forecast Workflow

Version: 1.0.0  
Date: 2026-11-17  
Status: Implemented on a review branch; first live FTP/model run still required.

## Execution model

- Forecast generation starts only from Actions → Chronos-2 Manual Forecast → Run workflow.
- No Cron, schedule, push trigger, website-triggered execution, or tab-change execution exists.
- Inputs are CHART symbol code, CHART timeframe code, and horizon (15/30/45/60).
- The workflow runs the existing host_subdomain/scripts/sync_tvdatafeed.py in a temporary runner directory. It does not commit or deploy temporary market data.
- The published site reference is downloaded from the configured FTP document root and compared with fresh input before inference.
- The pinned host_subdomain/scripts/chronos2_worker.py produces native Chronos-2 quantiles.
- Only a validated READY JSON is uploaded to data/chronos2/cache/; every valid run is also retained under data/chronos2/history/.
- Upload uses a temporary remote filename followed by FTP rename. Each valid run is retained in history; the active cache file is replaced.

## Workflow inputs

| Input | Allowed values |
|---|---|
| Symbol | SPOTBRENT, XAUUSD |
| Timeframe | M15, H1, H4, D1, W1 |
| Horizon | 15, 30, 45, 60 |

Symbol mapping: SPOTBRENT → PEPPERSTONE; XAUUSD → OANDA.

Timeframe mapping used by the workflow: M15 → 15; H1 → 60; H4 → 240; D1 → 1D; W1 → 1W. The existing sync script currently fetches all supported timeframes in one invocation; the selected CHART timeframe determines which normalized output is passed to the worker. The sync script itself is intentionally unchanged.

## Required GitHub configuration

Add these repository Secrets:

- FORECAST_FTP_HOST
- FORECAST_FTP_PORT (normally 21)
- FORECAST_FTP_USER
- FORECAST_FTP_PASSWORD

Add this repository Variable:

- FORECAST_FTP_REMOTE_ROOT — FTP-visible path to the website document root that contains data/tvdatafeed/ and data/chronos2/. Use the path as seen after logging in with the FTP account; it may be relative to that account's home directory.

The workflow uses Python's standard-library FTP client. No SSH key or SFTP configuration is required.

## Data alignment gate

The runner validates both JSON documents and their symbol/provider/timeframe metadata. It requires at least 32 closed fresh candles, compares the last closed candle timestamps and close prices, and counts intervening observed market candles rather than assuming continuous calendar bars. This avoids treating weekends and market closures as missing hourly/daily bars.

If the published site reference is more than two observed market bars behind fresh input, the workflow fails. Even when the difference is one or two bars, publication is rejected because the website's strict isChronosForecastMatchingTab gate requires exact origin equality. The workflow never rewrites or refreshes the site's reference data.

## Output contract

Filename:

    <symbol>_tvdatafeed_<CHART timeframe>_<origin_open_time_utc_ms>_H<horizon>.json

Example:

    SPOTBRENT_tvdatafeed_M15_1794931200000_H30.json

The worker's native JSON is preserved. Before upload, the runner checks READY status, schema, model ID, pinned revision, symbol, provider, timeframe, exact origin, horizon length, last close, finite quantiles, and monotonic quantile ordering.

## Runtime pins

- Python 3.11
- PyTorch 2.15.0+cpu
- Transformers 5.23.0
- chronos-forecasting 2.3.2

A dependency install/version mismatch fails the workflow. The workflow does not silently substitute versions.

## Website behavior

The website reads only the deterministic static cache filename using fetch with cache=no-store. A cache miss or mismatch is shown as unavailable/error. It does not call chronos2_forecast.php, invoke PHP→Python, poll a queue, or trigger model execution. The strict store gate remains unchanged.

## Known operational checks before first production use

1. Configure the four FTP secrets and the remote-root variable.
3. Run one manual workflow for a single symbol/timeframe/horizon.
4. Inspect the Actions log for the site-reference timestamp, fresh-input timestamp, exact dependency versions, model load/inference and successful atomic publish.
5. Open the matching website tab and confirm the static JSON is accepted by the existing origin gate.
6. Confirm that a normal APK/site deployment does not erase remote-only cache/history files. The current deployment workflow bundles tracked host_subdomain/ files and snapshots only selected directories; its data/cache persistence behavior remains a separate verification item and has not been changed here.

A GitHub Actions run is not considered successful until the output is visible on the website and its exact origin matches the active chart tab.
