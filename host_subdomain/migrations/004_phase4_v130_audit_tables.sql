-- Phase 4 v1.3.0 Spec Compliance Tables (CHART_FUTURE_PREDICTION_SPEC_v1.3.0.md)
-- Preserves immutable prediction_runs while adding append-only lifecycle/outcomes, key zones, MTF coordination, and path event vectors.

CREATE TABLE IF NOT EXISTS prediction_key_zones (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    zone_id VARCHAR(64) NOT NULL,
    zone_type VARCHAR(32) NOT NULL,
    low_price DECIMAL(18,8) NOT NULL,
    high_price DECIMAL(18,8) NOT NULL,
    center_price DECIMAL(18,8) NOT NULL,
    strength DECIMAL(6,4) NOT NULL DEFAULT 0.5000,
    touch_probability DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    penetration_probability DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    reclaim_probability DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    breakout_probability DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    reach_before_invalidation_prob DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    invalidation_before_reach_prob DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
    expected_bars_to_reach DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    invalidation_price DECIMAL(18,8) NOT NULL DEFAULT 0.00000000,
    horizon_bars INT NOT NULL DEFAULT 30,
    INDEX idx_pred_kz_run (run_id, zone_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_mtf_coordination (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    independent_timeframe VARCHAR(16) NOT NULL,
    reference_timeframe VARCHAR(16) NOT NULL,
    alignment_state VARCHAR(40) NOT NULL,
    ohlc_consistent TINYINT(1) NOT NULL DEFAULT 1,
    independent_median_pct DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    coordinated_median_pct DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    uncertainty_adjustment_factor DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
    conflict_reasons_json TEXT NULL,
    INDEX idx_pred_mtf_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_path_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    run_id BIGINT UNSIGNED NOT NULL,
    aleatoric_pct DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    epistemic_pct DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    ood_status VARCHAR(24) NOT NULL DEFAULT 'IN_DISTRIBUTION',
    ood_distance DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    no_edge_gate_state VARCHAR(32) NOT NULL DEFAULT 'NO_EDGE_DETECTED',
    effective_sample_size DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    skill_score_vs_baseline DECIMAL(8,4) NOT NULL DEFAULT 0.0000,
    ambiguous_rate_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    path_stats_json MEDIUMTEXT NULL,
    sensitivity_grid_json MEDIUMTEXT NULL,
    INDEX idx_pred_pe_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prediction_lifecycle_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_uuid VARCHAR(64) NOT NULL UNIQUE,
    run_uuid VARCHAR(64) NULL,
    forecast_hash CHAR(64) NOT NULL,
    symbol_code VARCHAR(32) NOT NULL,
    timeframe VARCHAR(16) NOT NULL,
    horizon_step INT NOT NULL DEFAULT 0,
    lifecycle_status VARCHAR(24) NOT NULL,
    evaluation_outcome VARCHAR(24) NOT NULL,
    reason VARCHAR(255) NOT NULL DEFAULT '',
    observed_close DECIMAL(18,8) NULL,
    prev_event_hash CHAR(64) NOT NULL,
    event_hash CHAR(64) NOT NULL,
    recorded_at_utc_ms BIGINT NOT NULL,
    INDEX idx_pred_lc_hash (forecast_hash, horizon_step),
    INDEX idx_pred_lc_sym (symbol_code, timeframe, recorded_at_utc_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
