-- CHART shared platform schema. Apply to an empty CHART database.
-- All timestamps are UTC. Prices use DECIMAL; never FLOAT/DOUBLE.
CREATE TABLE IF NOT EXISTS instruments (
  id VARCHAR(64) PRIMARY KEY,
  display_name VARCHAR(128) NOT NULL,
  tradingview_symbol VARCHAR(64) NOT NULL,
  market_type VARCHAR(24) NOT NULL,
  quote_currency VARCHAR(12) NOT NULL,
  price_basis VARCHAR(12) NOT NULL,
  decimals TINYINT UNSIGNED NOT NULL,
  is_initial_primary BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'TO_VERIFY',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS market_data_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  provider_code VARCHAR(48) NOT NULL,
  provider_symbol VARCHAR(80) NOT NULL,
  provider_instrument_type VARCHAR(32) NOT NULL,
  price_basis VARCHAR(12) NOT NULL,
  volume_type VARCHAR(12) NOT NULL DEFAULT 'unknown',
  status VARCHAR(24) NOT NULL DEFAULT 'TO_VERIFY',
  session_calendar VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_source_identity (instrument_id, provider_code, provider_symbol, provider_instrument_type, price_basis),
  CONSTRAINT fk_source_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS candles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  timeframe VARCHAR(8) NOT NULL,
  open_time_utc DATETIME(3) NOT NULL,
  close_time_utc DATETIME(3) NOT NULL,
  open_price DECIMAL(24,10) NOT NULL,
  high_price DECIMAL(24,10) NOT NULL,
  low_price DECIMAL(24,10) NOT NULL,
  close_price DECIMAL(24,10) NOT NULL,
  volume DECIMAL(30,10) NULL,
  volume_type VARCHAR(12) NOT NULL DEFAULT 'unknown',
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  quality_status VARCHAR(16) NOT NULL DEFAULT 'UNCERTAIN',
  data_role VARCHAR(16) NOT NULL DEFAULT 'HISTORICAL',
  payload_hash CHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_candle_identity (instrument_id, source_id, timeframe, open_time_utc),
  KEY ix_candles_range (instrument_id, timeframe, open_time_utc),
  CONSTRAINT fk_candle_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
  CONSTRAINT fk_candle_source FOREIGN KEY (source_id) REFERENCES market_data_sources(id),
  CONSTRAINT chk_candle_ohlc CHECK (high_price >= GREATEST(open_price, close_price) AND low_price <= LEAST(open_price, close_price) AND low_price > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analysis_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  timeframe VARCHAR(8) NOT NULL,
  candle_cutoff_utc DATETIME(3) NOT NULL,
  analysis_version VARCHAR(48) NOT NULL,
  trend_state VARCHAR(16) NULL,
  atr DECIMAL(24,10) NULL,
  rsi DECIMAL(12,6) NULL,
  macd DECIMAL(24,10) NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_snapshot_latest (instrument_id, timeframe, created_at),
  CONSTRAINT fk_snapshot_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
  CONSTRAINT fk_snapshot_source FOREIGN KEY (source_id) REFERENCES market_data_sources(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS forecasts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instrument_id VARCHAR(64) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  timeframe VARCHAR(8) NOT NULL,
  horizon VARCHAR(12) NOT NULL,
  candle_cutoff_utc DATETIME(3) NOT NULL,
  model_id VARCHAR(64) NOT NULL,
  model_version VARCHAR(48) NOT NULL,
  status VARCHAR(16) NOT NULL,
  payload_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_forecast_latest (instrument_id, timeframe, horizon, created_at),
  CONSTRAINT fk_forecast_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id),
  CONSTRAINT fk_forecast_source FOREIGN KEY (source_id) REFERENCES market_data_sources(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS worker_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_type VARCHAR(48) NOT NULL,
  schedule_key VARCHAR(128) NOT NULL,
  instrument_id VARCHAR(64) NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  locked_until DATETIME(3) NULL,
  locked_by VARCHAR(96) NULL,
  last_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_job_schedule (schedule_key),
  KEY ix_jobs_claim (status, available_at, id),
  CONSTRAINT fk_job_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id)
) ENGINE=InnoDB;

-- Seed only instrument identity. Provider mappings remain TO_VERIFY; no synthetic
-- candles are seeded and no provider is promoted to production by this migration.
INSERT INTO instruments (id, display_name, tradingview_symbol, market_type, quote_currency, price_basis, decimals, is_initial_primary, status)
VALUES
 ('XAUUSD_SPOT', 'Gold Spot / U.S. Dollar', 'XAUUSD', 'SPOT', 'USD', 'bid', 2, FALSE, 'TO_VERIFY'),
 ('SPOTBRENT', 'Brent Crude (Spot)', 'SPOTBRENT', 'SPOT', 'USD', 'mid', 2, TRUE, 'TO_VERIFY')
ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), tradingview_symbol=VALUES(tradingview_symbol), is_initial_primary=VALUES(is_initial_primary);
