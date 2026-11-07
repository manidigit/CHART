-- ============================================================================
-- Chart Intelligence · Phase 1 Non-Destructive MariaDB Schema (001_phase1_init.sql)
-- Engine: InnoDB · Charset: utf8mb4_unicode_ci · Prices: DECIMAL(18,8) · Time: UTC
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(120) NULL,
    password_hash VARCHAR(255) NOT NULL,
    reset_code_hash VARCHAR(255) NULL,
    reset_expires_at_utc DATETIME NULL,
    role ENUM('owner', 'admin', 'viewer') NOT NULL DEFAULT 'owner',
    preferred_lang CHAR(2) NOT NULL DEFAULT 'fa',
    preferred_theme VARCHAR(16) NOT NULL DEFAULT 'dark',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at_utc DATETIME NOT NULL,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_providers (
    provider_id VARCHAR(32) PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL,
    supports_intraday TINYINT(1) NOT NULL DEFAULT 1,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chart_series (
    chart_id VARCHAR(64) PRIMARY KEY,
    symbol_code VARCHAR(32) NOT NULL,
    display_name_en VARCHAR(120) NOT NULL,
    display_name_fa VARCHAR(120) NOT NULL,
    price_decimals TINYINT UNSIGNED NOT NULL DEFAULT 2,
    default_provider_id VARCHAR(32) NOT NULL,
    default_timeframe VARCHAR(8) NOT NULL DEFAULT 'M15',
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_series_provider FOREIGN KEY (default_provider_id) REFERENCES data_providers(provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chart_provider_channels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chart_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    provider_symbol VARCHAR(64) NOT NULL,
    timeframe VARCHAR(8) NOT NULL DEFAULT 'M15',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_sync_utc DATETIME NULL,
    last_status VARCHAR(32) NOT NULL DEFAULT 'READY',
    UNIQUE KEY uq_chart_provider_tf (chart_id, provider_id, timeframe),
    CONSTRAINT fk_channel_chart FOREIGN KEY (chart_id) REFERENCES chart_series(chart_id) ON DELETE CASCADE,
    CONSTRAINT fk_channel_provider FOREIGN KEY (provider_id) REFERENCES data_providers(provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_watchlist (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    chart_id VARCHAR(64) NOT NULL,
    active_provider_id VARCHAR(32) NOT NULL,
    active_timeframe VARCHAR(8) NOT NULL DEFAULT 'M15',
    sort_order INT NOT NULL DEFAULT 0,
    created_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_chart (user_id, chart_id),
    CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_watchlist_chart FOREIGN KEY (chart_id) REFERENCES chart_series(chart_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    chart_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NOT NULL,
    open_time_utc BIGINT NOT NULL COMMENT 'Epoch milliseconds snapped to 00:00:00 UTC boundary',
    open_price DECIMAL(18,8) NOT NULL,
    high_price DECIMAL(18,8) NOT NULL,
    low_price DECIMAL(18,8) NOT NULL,
    close_price DECIMAL(18,8) NOT NULL,
    volume DECIMAL(18,8) NOT NULL DEFAULT 0.00000000,
    is_closed TINYINT(1) NOT NULL DEFAULT 1,
    fetched_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_candle_identity (chart_id, provider_id, timeframe, open_time_utc),
    INDEX idx_candles_lookup (chart_id, provider_id, timeframe, open_time_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_open_tabs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    tab_key VARCHAR(96) NOT NULL,
    chart_id VARCHAR(64) NOT NULL,
    provider_id VARCHAR(32) NOT NULL,
    timeframe VARCHAR(8) NOT NULL DEFAULT 'M15',
    is_active_tab TINYINT(1) NOT NULL DEFAULT 0,
    tab_order INT NOT NULL DEFAULT 0,
    updated_at_utc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_tab (user_id, tab_key),
    CONSTRAINT fk_tabs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
