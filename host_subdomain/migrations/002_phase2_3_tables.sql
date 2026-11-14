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

INSERT IGNORE INTO data_providers (provider_id, display_name, supports_intraday, is_enabled) VALUES
('stooq',     'Stooq Multi-Decade Historical Feed', 0, 1),
('local_csv', 'Local Historical Import (CSV / XLS / JSON / Manual)', 1, 1);

CREATE TABLE IF NOT EXISTS data_import_batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chart_id VARCHAR(64) NOT NULL,
    symbol_code VARCHAR(32) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    file_name VARCHAR(180) NULL,
    file_sha256 CHAR(64) NOT NULL,
    quality_status VARCHAR(24) NOT NULL DEFAULT 'OFFICIAL',
    rows_total INT UNSIGNED NOT NULL DEFAULT 0,
    rows_inserted INT UNSIGNED NOT NULL DEFAULT 0,
    rows_corrected INT UNSIGNED NOT NULL DEFAULT 0,
    rows_skipped INT UNSIGNED NOT NULL DEFAULT 0,
    imported_by VARCHAR(64) NOT NULL DEFAULT 'owner',
    notes VARCHAR(255) NULL,
    imported_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_import_batch_lookup (symbol_code, provider_id, timeframe, imported_at_utc),
    INDEX idx_import_batch_hash (file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_corrections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT UNSIGNED NOT NULL,
    chart_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NOT NULL,
    open_time_utc BIGINT NOT NULL,
    old_open DECIMAL(18,8) NOT NULL,
    old_high DECIMAL(18,8) NOT NULL,
    old_low DECIMAL(18,8) NOT NULL,
    old_close DECIMAL(18,8) NOT NULL,
    old_volume DECIMAL(18,8) NOT NULL,
    new_open DECIMAL(18,8) NOT NULL,
    new_high DECIMAL(18,8) NOT NULL,
    new_low DECIMAL(18,8) NOT NULL,
    new_close DECIMAL(18,8) NOT NULL,
    new_volume DECIMAL(18,8) NOT NULL,
    correction_reason VARCHAR(64) NOT NULL DEFAULT 'IMPORT_OVERWRITE',
    corrected_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_corr_batch (batch_id),
    INDEX idx_corr_candle (chart_id, provider_id, timeframe, open_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    action_type VARCHAR(24) NOT NULL,
    format_version VARCHAR(32) NOT NULL DEFAULT 'ci_encrypted_backup_v1',
    checksum_sha256 CHAR(64) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_backup_user_time (username, created_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_username VARCHAR(64) NOT NULL DEFAULT 'owner',
    event_type VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id VARCHAR(96) NULL,
    details_json MEDIUMTEXT NULL,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_event_time (event_type, created_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

