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
            bullCandleColorHex = "FF10B981",
            bearCandleColorHex = "FFF43F5E",
            trendLineColorHex = "FFA855F7",
            horizontalLineColorHex = "FF38BDF8",
            verticalLineColorHex = "FFF59E0B",
            chartGridColorHex = "FF1E293B"
        )
        repository.saveChartPreferences(next)
        return next
    }

    fun resetAlgorithmParamsToDefault(current: ChartPreferences): ChartPreferences {
        val next = current.copy(
            candleFetchLimit = 500,
            maxVisibleCandles = 5000,
            zoomStepCandles = 8,
            drawingHitTolerancePx = 28f
        )
        repository.saveChartPreferences(next)
        return next
    }
}
