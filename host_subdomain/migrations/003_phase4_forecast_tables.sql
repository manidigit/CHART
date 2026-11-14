-- Phase 4 Future Price Projection Engine v1 (SPEC-PRED-01) Schema

CREATE TABLE IF NOT EXISTS prediction_models (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    model_id VARCHAR(64) NOT NULL UNIQUE,
    model_name VARCHAR(128) NOT NULL,
    model_family VARCHAR(64) NOT NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    default_weight DECIMAL(8,4) NOT NULL DEFAULT 0.2000,
    params_json TEXT NULL,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO prediction_models (model_id, model_name, model_family, is_enabled, default_weight, params_json) VALUES
('naive_persistence', 'Naive Persistence (Random Walk)', 'BASELINE', 1, 0.1000, '{"volFloor":0.0005}'),
('historical_drift', 'Damped Historical Drift', 'BASELINE', 1, 0.1600, '{"damping":0.9,"lookback":24}'),
('kalman_momentum', 'Kalman State-Space Filter', 'STATE_SPACE', 1, 0.2400, '{"processNoise":0.08,"obsNoise":1.0,"velocityDecay":0.86}'),
('garch_volatility', 'GARCH(1,1) Conditional Volatility', 'VOLATILITY', 1, 0.2400, '{"alpha":0.09,"beta":0.87,"meanRevertPull":0.84}'),
('arima_ets', 'Damped AR(2) + ETS', 'TIME_SERIES', 1, 0.2200, '{"damping":0.88,"alphaEts":0.32}'),
('gaussian_process', 'RBF Gaussian Process', 'NON_PARAMETRIC', 1, 0.1400, '{"lengthScale":7.5,"noiseRatio":0.35}');

CREATE TABLE IF NOT EXISTS prediction_runs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_uuid VARCHAR(64) NOT NULL UNIQUE,
    username VARCHAR(64) NOT NULL DEFAULT 'owner',
    symbol_code VARCHAR(32) NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    horizon_bars INT NOT NULL DEFAULT 30,
    contract_version VARCHAR(32) NOT NULL DEFAULT 'forecast-contract/v1',
    forecast_status VARCHAR(32) NOT NULL DEFAULT 'PROVISIONAL',
    regime VARCHAR(32) NOT NULL DEFAULT 'RANGING',
    anchor_open_time_utc_ms BIGINT NOT NULL,
    anchor_close DECIMAL(18,8) NOT NULL,
    terminal_q10 DECIMAL(18,8) NOT NULL,
    terminal_q50 DECIMAL(18,8) NOT NULL,
    terminal_q90 DECIMAL(18,8) NOT NULL,
    input_hash CHAR(64) NOT NULL,
    prev_forecast_hash CHAR(64) NOT NULL,
    forecast_hash CHAR(64) NOT NULL,
    remote_worker_status VARCHAR(48) NOT NULL DEFAULT 'LOCAL_STATISTICAL_ONLY',
    payload_json MEDIUMTEXT NOT NULL,
    created_at_utc_ms BIGINT NOT NULL,
    INDEX idx_pred_runs_sym_tf (symbol_code, timeframe, created_at_utc_ms),
    INDEX idx_pred_runs_hash (forecast_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_forecasts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    step_ahead INT NOT NULL,
    open_time_utc_ms BIGINT NOT NULL,
    q10 DECIMAL(18,8) NOT NULL,
    q25 DECIMAL(18,8) NOT NULL,
    q50 DECIMAL(18,8) NOT NULL,
    q75 DECIMAL(18,8) NOT NULL,
    q90 DECIMAL(18,8) NOT NULL,
    synth_open DECIMAL(18,8) NOT NULL,
    synth_high DECIMAL(18,8) NOT NULL,
    synth_low DECIMAL(18,8) NOT NULL,
    synth_close DECIMAL(18,8) NOT NULL,
    INDEX idx_pred_fc_run_step (run_id, step_ahead)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_scenarios (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    scenario_id VARCHAR(32) NOT NULL,
    scenario_label VARCHAR(128) NOT NULL,
    bias VARCHAR(16) NOT NULL,
    probability DECIMAL(6,4) NOT NULL,
    target_price DECIMAL(18,8) NOT NULL,
    extreme_price DECIMAL(18,8) NOT NULL,
    invalidation_reference DECIMAL(18,8) NOT NULL,
    INDEX idx_pred_scen_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_walkforward_benchmarks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    model_id VARCHAR(64) NOT NULL,
    evaluated_windows INT NOT NULL DEFAULT 0,
    eval_horizon INT NOT NULL DEFAULT 5,
    mae DECIMAL(18,8) NOT NULL,
    rmse DECIMAL(18,8) NOT NULL,
    directional_accuracy_pct DECIMAL(6,2) NOT NULL,
    pinball_loss DECIMAL(18,8) NOT NULL,
    coverage80_pct DECIMAL(6,2) NOT NULL,
    crps DECIMAL(18,8) NOT NULL,
    mae_improvement_vs_naive_pct DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    INDEX idx_pred_wf_run (run_id, model_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
