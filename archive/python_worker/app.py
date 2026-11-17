"""Optional FastAPI forecasting worker for Chart Intelligence (statsmodels ARIMA, Prophet, PyTorch LSTM, PyTorch TFT)."""

from __future__ import annotations

import importlib.util
from typing import Any, Dict, List

try:
    from .models.arima_model import MODEL_ID as ARIMA_ID, MODEL_NAME as ARIMA_NAME, predict_arima
    from .models.common import sanitize_candles
    from .models.lstm_model import MODEL_ID as LSTM_ID, MODEL_NAME as LSTM_NAME, predict_lstm
    from .models.prophet_model import MODEL_ID as PROPHET_ID, MODEL_NAME as PROPHET_NAME, predict_prophet
    from .models.tft_model import MODEL_ID as TFT_ID, MODEL_NAME as TFT_NAME, predict_tft
    from .walk_forward import evaluate_models_walk_forward
except ImportError:
    from models.arima_model import MODEL_ID as ARIMA_ID, MODEL_NAME as ARIMA_NAME, predict_arima
    from models.common import sanitize_candles
    from models.lstm_model import MODEL_ID as LSTM_ID, MODEL_NAME as LSTM_NAME, predict_lstm
    from models.prophet_model import MODEL_ID as PROPHET_ID, MODEL_NAME as PROPHET_NAME, predict_prophet
    from models.tft_model import MODEL_ID as TFT_ID, MODEL_NAME as TFT_NAME, predict_tft
    from walk_forward import evaluate_models_walk_forward

MODEL_SPECS: List[Dict[str, Any]] = [
    {"modelId": ARIMA_ID, "modelName": ARIMA_NAME, "family": "ECONOMETRIC", "fn": predict_arima},
    {"modelId": PROPHET_ID, "modelName": PROPHET_NAME, "family": "DECOMPOSITION", "fn": predict_prophet},
    {"modelId": LSTM_ID, "modelName": LSTM_NAME, "family": "DEEP_LEARNING", "fn": predict_lstm},
    {"modelId": TFT_ID, "modelName": TFT_NAME, "family": "DEEP_LEARNING", "fn": predict_tft},
]


def check_dependency_health() -> Dict[str, bool]:
    pkgs = ("statsmodels", "prophet", "torch", "pytorch_forecasting", "lightning", "pandas", "numpy")
    return {pkg: importlib.util.find_spec(pkg) is not None for pkg in pkgs}


def infer_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    symbol_code = str(payload.get("symbolCode") or payload.get("symbol") or "SPOTBRENT").strip().upper()
    timeframe = str(payload.get("timeframe") or "M15").strip().upper()
    horizon = max(10, min(60, int(payload.get("horizonBars") or payload.get("horizon_bars") or 30)))
    raw_candles = payload.get("candles") or []
    clean = sanitize_candles(raw_candles)
    if len(clean) < 24:
        return {
            "contractVersion": "forecast-contract/v1",
            "status": "DATA_NOT_READY",
            "symbolCode": symbol_code,
            "timeframe": timeframe,
            "horizonBars": horizon,
            "modelTrajectories": [],
            "modelBenchmarks": [],
            "reason": f"At least 24 valid bars required (got {len(clean)}).",
        }

    trajectories: List[Dict[str, Any]] = []
    for sp in MODEL_SPECS:
        try:
            trajectories.append(sp["fn"](clean, timeframe, horizon))
        except Exception as exc:
            trajectories.append(
                {
                    "modelId": sp["modelId"],
                    "modelName": sp["modelName"],
                    "family": sp["family"],
                    "modelVersion": "1.0.0",
                    "executionRuntime": "PYTHON_WORKER",
                    "isApproximation": False,
                    "isCalibratedInterval": sp["modelId"] != LSTM_ID,
                    "status": "FAILED",
                    "reason": str(exc),
                    "points": [],
                }
            )

    benchmarks = evaluate_models_walk_forward(clean, timeframe, MODEL_SPECS, trajectories)
    return {
        "contractVersion": "forecast-contract/v1",
        "status": "OK",
        "symbolCode": symbol_code,
        "timeframe": timeframe,
        "horizonBars": horizon,
        "modelTrajectories": trajectories,
        "modelBenchmarks": benchmarks,
    }


def create_fastapi_app() -> Any:
    from fastapi import FastAPI
    from pydantic import BaseModel, Field

    class CandleIn(BaseModel):
        open_time_utc_ms: int = 0
        open: float
        high: float
        low: float
        close: float
        volume: float = 100.0

    class InferRequest(BaseModel):
        contractVersion: str = "forecast-contract/v1"
        symbolCode: str = "SPOTBRENT"
        timeframe: str = "M15"
        horizonBars: int = Field(default=30, ge=10, le=60)
        inputHash: str = ""
        candles: List[CandleIn]

    fastapi_app = FastAPI(title="Chart Intelligence Forecast Worker", version="1.0.0")

    @fastapi_app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "models": [sp["modelId"] for sp in MODEL_SPECS],
            "availableDependencies": check_dependency_health(),
        }

    @fastapi_app.post("/forecast/infer")
    def forecast_infer(req: InferRequest) -> Dict[str, Any]:
        return infer_payload(req.model_dump())

    return fastapi_app


try:
    app = create_fastapi_app()
except ImportError:
    app = None
