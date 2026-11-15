"""Genuine PyTorch 2-layer LSTM with training-window-only scaling & 50-pass MC Dropout."""

from __future__ import annotations

import math
from typing import Any, Dict, Sequence

from .common import CANONICAL_HORIZON, build_future_timestamps, build_points_from_quantiles

MODEL_ID = "py_lstm_torch"
MODEL_NAME = "PyTorch LSTM (2-Layer + MC Dropout)"


def predict_lstm(
    candles: Sequence[Dict[str, float]],
    timeframe: str,
    horizon: int,
    mc_passes: int = 50,
    epochs: int = 24,
) -> Dict[str, Any]:
    seq_len = 16
    if len(candles) < seq_len + 20:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": False,
            "status": "SKIPPED_LOW_DATA",
            "reason": f"At least {seq_len + 20} bars required for PyTorch LSTM (got {len(candles)}).",
            "points": [],
        }

    try:
        import numpy as np
        import torch
        import torch.nn as nn
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": False,
            "status": "FAILED",
            "reason": f"torch/numpy unavailable: {exc}",
            "points": [],
        }

    try:
        torch.manual_seed(42 + len(candles))
        np.random.seed(42 + len(candles))

        closes = np.array([float(c["close"]) for c in candles], dtype=np.float32)
        rets = np.diff(np.log(np.maximum(1e-8, closes)))

        # Strictly fit scaler on training returns only (never full series beyond training slice)
        mean_r = float(np.mean(rets))
        std_r = max(1e-5, float(np.std(rets, ddof=1)))
        norm_r = np.clip((rets - mean_r) / std_r, -4.0, 4.0).astype(np.float32)

        x_list, y_list = [], []
        for idx in range(seq_len, len(norm_r)):
            x_list.append(norm_r[idx - seq_len : idx])
            y_list.append(norm_r[idx])

        x_tensor = torch.tensor(np.array(x_list), dtype=torch.float32).unsqueeze(-1)
        y_tensor = torch.tensor(np.array(y_list), dtype=torch.float32).unsqueeze(-1)

        class StackedLstmForecast(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.lstm = nn.LSTM(input_size=1, hidden_size=32, num_layers=2, dropout=0.18, batch_first=True)
                self.head = nn.Linear(32, 1)

            def forward(self, x: torch.Tensor) -> torch.Tensor:
                out, _ = self.lstm(x)
                return self.head(out[:, -1, :])

        model = StackedLstmForecast()
        optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
        loss_fn = nn.MSELoss()

        model.train()
        for _ in range(max(8, epochs)):
            optimizer.zero_grad()
            pred = model(x_tensor)
            loss = loss_fn(pred, y_tensor)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

        roll_h = max(horizon, CANONICAL_HORIZON)
        base_win = torch.tensor(norm_r[-seq_len:], dtype=torch.float32).view(1, seq_len, 1)
        # Keep model.train() active during inference so LSTM dropout layers remain stochastic (Gal & Ghahramani MC Dropout)
        model.train()
        last_log = float(math.log(max(1e-8, float(closes[-1]))))
        paths = np.zeros((mc_passes, roll_h), dtype=np.float64)

        with torch.no_grad():
            batch_win = base_win.repeat(mc_passes, 1, 1)
            cum_logs = np.full(mc_passes, last_log, dtype=np.float64)
            for h in range(roll_h):
                next_norm = model(batch_win).squeeze(-1).cpu().numpy()
                damp = math.exp(-0.025 * h)
                step_rets = np.clip(mean_r + next_norm * std_r * damp, -0.05, 0.05)
                # Include aleatoric innovation proportional to empirical training sigma
                noise = np.random.normal(0.0, std_r * 0.55, size=mc_passes)
                total_step = np.clip(step_rets + noise, -0.06, 0.06)
                cum_logs = cum_logs + total_step
                paths[:, h] = np.exp(cum_logs)

                next_fed = torch.tensor(
                    np.clip((total_step - mean_r) / std_r, -4.0, 4.0), dtype=torch.float32
                ).view(mc_passes, 1, 1)
                batch_win = torch.cat([batch_win[:, 1:, :], next_fed], dim=1)

        q10 = np.quantile(paths[:, :horizon], 0.10, axis=0).tolist()
        q25 = np.quantile(paths[:, :horizon], 0.25, axis=0).tolist()
        q50 = np.quantile(paths[:, :horizon], 0.50, axis=0).tolist()
        q75 = np.quantile(paths[:, :horizon], 0.75, axis=0).tolist()
        q90 = np.quantile(paths[:, :horizon], 0.90, axis=0).tolist()

        last_ms = int(candles[-1]["open_time_utc_ms"])
        ts = build_future_timestamps(last_ms, timeframe, horizon)
        pts = build_points_from_quantiles(float(closes[-1]), ts, q10, q25, q50, q75, q90, horizon)
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": False,
            "status": "SUCCESS",
            "reason": "",
            "trainingStartUtcMs": int(candles[0]["open_time_utc_ms"]),
            "trainingEndUtcMs": last_ms,
            "trainingSampleCount": len(candles),
            "points": pts,
        }
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": False,
            "status": "FAILED",
            "reason": f"PyTorch LSTM failed: {exc}",
            "points": [],
        }
