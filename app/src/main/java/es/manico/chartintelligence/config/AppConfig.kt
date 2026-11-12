package es.manico.chartintelligence.config

import es.manico.chartintelligence.BuildConfig

object AppConfig {
    const val API_BASE_URL: String = BuildConfig.API_BASE_URL
    const val PREFS_FILE_NAME: String = "chart_intelligence_phase1_prefs"

    const val KEY_LANGUAGE: String = "pref_language"
    const val KEY_DARK_THEME: String = "pref_dark_theme"
    const val KEY_OWNER_USERNAME: String = "pref_owner_username"
    const val KEY_OWNER_EMAIL: String = "pref_owner_email"
    const val KEY_OWNER_PASSWORD_HASH: String = "pref_owner_password_hash"
    const val KEY_OWNER_PASSWORD_SALT: String = "pref_owner_password_salt"
    const val KEY_OWNER_RESET_CODE_HASH: String = "pref_owner_reset_code_hash"
    const val KEY_OWNER_RESET_EXPIRES_MS: String = "pref_owner_reset_expires_ms"
    const val KEY_SYMBOLS_CONFIG_JSON: String = "pref_symbols_config_json"
    const val KEY_CHART_PREFERENCES_JSON: String = "pref_chart_preferences_json"
    const val KEY_CANDLES_CACHE_PREFIX: String = "pref_candles_cache_v2_"
    const val KEY_DRAWINGS_CACHE_PREFIX: String = "pref_drawings_cache_v1_"
    const val KEY_SPOTBRENT_TV_MIGRATED: String = "pref_spotbrent_tvdatafeed_migrated_v1"
    const val KEY_REMEMBER_CREDENTIALS: String = "pref_remember_credentials"
    const val KEY_SAVED_PASSWORD: String = "pref_saved_owner_password"
    const val KEY_SESSION_AUTHENTICATED: String = "pref_session_authenticated"
    const val KEY_SESSION_TOKEN: String = "pref_session_token"
    const val KEY_OPEN_TABS_JSON: String = "pref_open_tabs_json"

    const val DEFAULT_LANGUAGE_CODE: String = "fa"
    const val DEFAULT_DARK_THEME: Boolean = true
    const val DEFAULT_TIMEFRAME: String = "M15"
    val SUPPORTED_TIMEFRAMES: List<String> = listOf("M15", "M30", "H1", "H4", "D1", "W1")

    const val DEFAULT_CANDLE_FETCH_LIMIT: Int = 2500
    const val MIN_VISIBLE_CANDLES: Int = 12
    const val MAX_VISIBLE_CANDLES: Int = 5000
    const val DEFAULT_VISIBLE_CANDLES: Int = 48
}
