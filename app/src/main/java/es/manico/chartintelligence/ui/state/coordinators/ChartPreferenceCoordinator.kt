package es.manico.chartintelligence.ui.state.coordinators

import es.manico.chartintelligence.data.model.ChartPreferences
import es.manico.chartintelligence.data.repository.WorkspaceRepository

/**
 * Dedicated coordinator managing non-hardcoded user preferences:
 * visual candle and line colors, algorithm calculation parameters, and reset actions.
 */
class ChartPreferenceCoordinator(private val repository: WorkspaceRepository) {

    fun loadInitialPreferences(): ChartPreferences {
        return repository.loadChartPreferences()
    }

    fun updateBullCandleColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(bullCandleColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateBearCandleColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(bearCandleColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateTrendLineColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(trendLineColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateHorizontalLineColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(horizontalLineColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateVerticalLineColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(verticalLineColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateDefaultDrawingColor(current: ChartPreferences, colorHex: String): ChartPreferences {
        val next = current.copy(defaultDrawingColorHex = colorHex)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateDefaultDrawingWidth(current: ChartPreferences, widthDp: Float): ChartPreferences {
        val next = current.copy(defaultDrawingWidthDp = widthDp.coerceIn(1.0f, 8.0f))
        repository.saveChartPreferences(next)
        return next
    }

    fun updateBollingerParams(current: ChartPreferences, period: Int, stdDev: Float): ChartPreferences {
        val next = current.copy(
            bollingerPeriod = period.coerceIn(5, 200),
            bollingerStdDev = stdDev.coerceIn(0.5f, 5.0f)
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun updateAlgorithmParams(
        current: ChartPreferences,
        fetchLimit: Int,
        zoomStep: Int,
        touchTolerance: Float
    ): ChartPreferences {
        val next = current.copy(
            candleFetchLimit = fetchLimit.coerceIn(40, 5000),
            maxVisibleCandles = 5000,
            zoomStepCandles = zoomStep.coerceIn(2, 24),
            drawingHitTolerancePx = touchTolerance.coerceIn(12f, 48f)
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun resetChartColorsToDefault(current: ChartPreferences): ChartPreferences {
        val next = current.copy(
            bullCandleColorHex = "FF26A69A",
            bearCandleColorHex = "FFEF5350",
            trendLineColorHex = "FF2962FF",
            horizontalLineColorHex = "FF38BDF8",
            verticalLineColorHex = "FFF59E0B",
            chartGridColorHex = "FF2A2E39",
            defaultDrawingColorHex = "FF2962FF",
            defaultDrawingWidthDp = 2.0f
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun resetAlgorithmParamsToDefault(current: ChartPreferences): ChartPreferences {
        val next = current.copy(
            candleFetchLimit = 500,
            maxVisibleCandles = 5000,
            zoomStepCandles = 8,
            drawingHitTolerancePx = 28f,
            bollingerPeriod = 20,
            bollingerStdDev = 2.0f
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun resetAllPreferencesToDefault(current: ChartPreferences): ChartPreferences {
        val next = ChartPreferences(
            twelveDataApiKey = current.twelveDataApiKey,
            stooqApiKey = current.stooqApiKey,
            alphaVantageApiKey = current.alphaVantageApiKey,
            finnhubApiKey = current.finnhubApiKey
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun updateTimezoneMode(current: ChartPreferences, mode: String): ChartPreferences {
        val norm = if (mode.equals("LOCAL", ignoreCase = true)) "LOCAL" else "UTC"
        val next = current.copy(timezoneMode = norm)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateTradingViewPreference(
        current: ChartPreferences,
        transform: (ChartPreferences) -> ChartPreferences
    ): ChartPreferences {
        val next = transform(current)
        repository.saveChartPreferences(next)
        return next
    }

    fun updateForecastPreferences(
        current: ChartPreferences,
        renderMode: String? = null,
        horizonBars: Int? = null,
        pluginConfigJson: String? = null,
        workerUrl: String? = null
    ): ChartPreferences {
        val next = current.copy(
            forecastRenderMode = renderMode?.let {
                es.manico.chartintelligence.forecast.ForecastRenderMode.parse(it).key
            } ?: current.forecastRenderMode,
            forecastHorizonBars = horizonBars?.let {
                es.manico.chartintelligence.forecast.ForecastCalendarHelper.clampHorizonBars(it)
            } ?: current.forecastHorizonBars,
            forecastPluginConfigJson = pluginConfigJson ?: current.forecastPluginConfigJson,
            forecastWorkerUrl = workerUrl ?: current.forecastWorkerUrl
        )
        repository.saveChartPreferences(next)
        return next
    }
}
