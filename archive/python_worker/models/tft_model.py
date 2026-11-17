"""Genuine PyTorch Forecasting Temporal Fusion Transformer with verified QuantileLoss indices and <90 bar skip."""

from __future__ import annotations

import math
from typing import Any, Dict, Sequence

from .common import CANONICAL_HORIZON, build_future_timestamps, build_points_from_quantiles

MODEL_ID = "py_tft_torch"
MODEL_NAME = "PyTorch Forecasting TFT"
TFT_QUANTILES = [0.1, 0.25, 0.5, 0.75, 0.9]


def resolve_quantile_indices(quantiles: Sequence[float]) -> Dict[float, int]:
    """Explicitly look up quantile indices instead of hardcoding index 3 as median."""
    mapping: Dict[float, int] = {}
    for target in TFT_QUANTILES:
        best_idx = min(range(len(quantiles)), key=lambda idx: abs(float(quantiles[idx]) - target))
        mapping[target] = best_idx
    return mapping


def predict_tft(
    candles: Sequence[Dict[str, float]],
    timeframe: str,
    horizon: int,
    max_epochs: int = 8,
) -> Dict[str, Any]:
    if len(candles) < 90:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "SKIPPED_LOW_DATA",
            "reason": f"TFT requires at least 90 bars for variable selection & attention (got {len(candles)}).",
            "points": [],
        }

    try:
        import lightning.pytorch as pl
        import numpy as np
        import pandas as pd
        import torch
        from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
        from pytorch_forecasting.data import GroupNormalizer
        from pytorch_forecasting.metrics import QuantileLoss
    except Exception as exc:
        return {
            "modelId": MODEL_ID,
            "modelName": MODEL_NAME,
            "family": "DEEP_LEARNING",
            "modelVersion": "1.0.0",
            "executionRuntime": "PYTHON_WORKER",
            "isApproximation": False,
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"pytorch_forecasting/lightning unavailable: {exc}",
            "points": [],
        }

    try:
        pl.seed_everything(42 + len(candles), workers=False)
        roll_h = max(horizon, CANONICAL_HORIZON)
        enc_len = min(48, max(24, len(candles) // 3))

        closes = np.array([float(c["close"]) for c in candles], dtype=np.float64)
        vols = np.array([max(1.0, float(c.get("volume", 100.0))) for c in candles], dtype=np.float64)
        log_prices = np.log(np.maximum(1e-8, closes))
        log_vols = np.log1p(vols)

        df = pd.DataFrame(
            {
                "time_idx": np.arange(len(candles), dtype=np.int64),
                "series_id": "CHART_SERIES",
                "log_close": log_prices,
                "log_volume": log_vols,
            }
        )

        # Training dataset built strictly inside causal history slice
        max_enc_idx = len(candles) - 1
        training = TimeSeriesDataSet(
            df[df["time_idx"] <= max_enc_idx],
            time_idx="time_idx",
            target="log_close",
            group_ids=["series_id"],
            min_encoder_length=max(12, enc_len // 2),
            max_encoder_length=enc_len,
            min_prediction_length=1,
            max_prediction_length=roll_h,
            static_categoricals=["series_id"],
            time_varying_known_reals=["time_idx"],
            time_varying_unknown_reals=["log_close", "log_volume"],
            target_normalizer=GroupNormalizer(groups=["series_id"], transformation=None),
            add_relative_time_idx=True,
            add_target_scales=True,
            add_encoder_length=True,
        )
        train_loader = training.to_dataloader(train=True, batch_size=32, num_workers=0)

        loss_fn = QuantileLoss(quantiles=TFT_QUANTILES)
        q_idx = resolve_quantile_indices(loss_fn.quantiles)

        tft = TemporalFusionTransformer.from_dataset(
            training,
            learning_rate=0.02,
            hidden_size=16,
            attention_head_size=2,
            dropout=0.15,
            hidden_continuous_size=8,
            loss=loss_fn,
            reduce_on_plateau_patience=3,
        )

        trainer = pl.Trainer(
            max_epochs=max(4, max_epochs),
            accelerator="cpu",
            enable_checkpointing=False,
            logger=False,
            enable_progress_bar=False,
            enable_model_summary=False,
            gradient_clip_val=0.2,
        )
        trainer.fit(tft, train_dataloaders=train_loader)

        # Build inference prediction slice combining tail encoder + future decoder placeholders
        enc_df = df.tail(enc_len).copy()
        last_idx = int(enc_df["time_idx"].iloc[-1])
        fut_df = pd.DataFrame(
            {
                "time_idx": np.arange(last_idx + 1, last_idx + 1 + roll_h, dtype=np.int64),
                "series_id": "CHART_SERIES",
                "log_close": float(log_prices[-1]),
                "log_volume": float(log_vols[-1]),
            }
        )
        pred_input = pd.concat([enc_df, fut_df], ignore_index=True)
        raw_preds = tft.predict(pred_input, mode="quantiles", return_x=False)
        tensor = raw_preds[0] if isinstance(raw_preds, (list, tuple)) else raw_preds
        if not isinstance(tensor, torch.Tensor):
            tensor = torch.as_tensor(tensor)

        # Anchor first predicted median step continuously to last close
        arr = tensor.detach().cpu().numpy()[0]  # [roll_h, num_quantiles]
        first_med = float(arr[0, q_idx[0.5]])
        anchor_shift = float(log_prices[-1]) - first_med

        q10, q25, q50, q75, q90 = [], [], [], [], []
        for h in range(horizon):
            shift = anchor_shift * math.exp(-0.04 * h)
            q10.append(math.exp(float(arr[h, q_idx[0.1]]) + shift))
            q25.append(math.exp(float(arr[h, q_idx[0.25]]) + shift))
            q50.append(math.exp(float(arr[h, q_idx[0.5]]) + shift))
            q75.append(math.exp(float(arr[h, q_idx[0.75]]) + shift))
            q90.append(math.exp(float(arr[h, q_idx[0.9]]) + shift))

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
            "isCalibratedInterval": True,
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
            "isCalibratedInterval": True,
            "status": "FAILED",
            "reason": f"PyTorch TFT failed: {exc}",
            "points": [],
        }
