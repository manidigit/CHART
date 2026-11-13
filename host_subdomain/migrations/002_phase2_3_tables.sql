-- ============================================================================
-- Chart Intelligence · Phase 2 & 3 Non-Destructive Schema Additions (002_phase2_3_tables.sql)
-- Engine: InnoDB · Charset: utf8mb4_unicode_ci · Time: UTC
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_quality_reports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chart_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NOT NULL,
    gaps_found INT UNSIGNED NOT NULL DEFAULT 0,
    missing_bars_total INT UNSIGNED NOT NULL DEFAULT 0,
    largest_gap_start_utc BIGINT NULL,
    largest_gap_end_utc BIGINT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'CLEAN',
    report_json MEDIUMTEXT NOT NULL,
    checked_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dq_chart_prov_tf (chart_id, provider_id, timeframe),
    INDEX idx_dq_status (status, checked_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS symbol_intel_cache (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    symbol_code VARCHAR(32) NOT NULL,
    feed_type VARCHAR(32) NOT NULL,
    payload_json MEDIUMTEXT NOT NULL,
    expires_at_utc DATETIME NOT NULL,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intel_sym_feed (symbol_code, feed_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
