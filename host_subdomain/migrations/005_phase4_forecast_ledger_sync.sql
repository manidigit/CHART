-- Phase 4 Forecast Ledger Cloud Sync Table (FCST-LEDGER-03)
-- Stores immutable ForecastLedger snapshot entries (including multi-model batchId, stepPoints, keyZones, pathEvents, behaviorScenarios, scenarios)
-- alongside prediction_lifecycle_events for bidirectional multi-device cloud synchronization.

CREATE TABLE IF NOT EXISTS prediction_ledger_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT 'owner',
    forecast_hash CHAR(64) NOT NULL,
    prev_forecast_hash CHAR(64) NOT NULL,
    seq INT UNSIGNED NOT NULL DEFAULT 1,
    batch_id VARCHAR(96) NOT NULL DEFAULT '',
    symbol_code VARCHAR(32) NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    horizon_bars INT NOT NULL DEFAULT 30,
    model_id VARCHAR(64) NOT NULL DEFAULT 'AUTO',
    anchor_open_time_utc_ms BIGINT NOT NULL DEFAULT 0,
    recorded_at_utc_ms BIGINT NOT NULL DEFAULT 0,
    entry_json MEDIUMTEXT NOT NULL,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pred_ledger_user_hash (username, forecast_hash),
    INDEX idx_pred_ledger_user_rec (username, recorded_at_utc_ms),
    INDEX idx_pred_ledger_sym_tf (symbol_code, timeframe, anchor_open_time_utc_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_ledger_lifecycle (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL DEFAULT 'owner',
    event_hash CHAR(64) NOT NULL,
    prev_event_hash CHAR(64) NOT NULL,
    forecast_hash CHAR(64) NOT NULL,
    seq INT UNSIGNED NOT NULL DEFAULT 1,
    symbol_code VARCHAR(32) NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    horizon_step INT NOT NULL DEFAULT 0,
    lifecycle_status VARCHAR(24) NOT NULL,
    evaluation_outcome VARCHAR(24) NOT NULL,
    recorded_at_utc_ms BIGINT NOT NULL DEFAULT 0,
    event_json MEDIUMTEXT NOT NULL,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pred_lc_user_hash (username, event_hash),
    INDEX idx_pred_lc_user_rec (username, recorded_at_utc_ms),
    INDEX idx_pred_lc_fc_hash (username, forecast_hash, horizon_step)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
