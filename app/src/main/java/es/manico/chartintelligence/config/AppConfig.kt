package es.manico.chartintelligence.config

import es.manico.chartintelligence.BuildConfig

object AppConfig {
    const val API_BASE_URL: String = BuildConfig.API_BASE_URL
    const val PREFS_FILE_NAME: String = "chart_intelligence_phase1_prefs"

    const val KEY_LANGUAGE: String = "pref_language"
    const val KEY_DARK_THEME: String = "pref_dark_theme"
    const val KEY_OWNER_USERNAME: String = "pref_owner_username"
    const val KEY_OWNER_PASSWORD_HASH: String = "pref_owner_password_hash"
    const val KEY_OWNER_PASSWORD_SALT: String = "pref_owner_password_salt"
    const val KEY_SYMBOLS_CONFIG_JSON: String = "pref_symbols_config_json"
    const val KEY_OPEN_TABS_JSON: String = "pref_open_tabs_json"
    const val KEY_ACTIVE_TAB_ID: String = "pref_active_tab_id"

    const val DEFAULT_LANGUAGE_CODE: String = "fa"
    const val DEFAULT_DARK_THEME: Boolean = true
    const val DEFAULT_TIMEFRAME: String = "M15"
    const val DAILY_TIMEFRAME: String = "D1"

    const val DEFAULT_CANDLE_FETCH_LIMIT: Int = 96
    const val MIN_VISIBLE_CANDLES: Int = 20
    const val MAX_VISIBLE_CANDLES: Int = 120
    const val DEFAULT_VISIBLE_CANDLES: Int = 48
}
