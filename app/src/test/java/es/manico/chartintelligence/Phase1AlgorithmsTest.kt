package es.manico.chartintelligence

import es.manico.chartintelligence.algorithms.CandleValidatorAlgorithm
import es.manico.chartintelligence.algorithms.PasswordHashAlgorithm
import es.manico.chartintelligence.algorithms.PriceFormatterAlgorithm
import es.manico.chartintelligence.algorithms.UtcTimeAnchorAlgorithm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class Phase1AlgorithmsTest {

    @Test
    fun utcTimeAnchor_snapsM15AndFiltersOpenCandles() {
        val rawMillis = 1793966852000L
        val step = 15L * 60L * 1000L
        val snapped = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(rawMillis, "M15")
        assertEquals(0L, snapped % step)
        assertFalse(UtcTimeAnchorAlgorithm.isCandleClosed(snapped, "M15", rawMillis))
        assertTrue(UtcTimeAnchorAlgorithm.isCandleClosed(snapped - step, "M15", rawMillis))
    }

    @Test
    fun candleValidator_enforcesDecimalScaleAndIdempotentMerge() {
        val nowMillis = 1793966852000L
        val closedOpen = UtcTimeAnchorAlgorithm.snapToCandleOpenUtc(nowMillis, "M15") - (15L * 60L * 1000L)
        val c1 = CandleValidatorAlgorithm.sanitizeAndValidate(
            rawOpenTimeMillis = closedOpen,
            timeframe = "M15",
            open = BigDecimal("2740.10"),
            high = BigDecimal("2745.50"),
            low = BigDecimal("2739.00"),
            close = BigDecimal("2743.25"),
            volume = BigDecimal("510.5")
        )
        assertNotNull(c1)
        assertEquals(8, c1!!.close.scale())

        val merged = CandleValidatorAlgorithm.mergeIdempotent(
            existing = listOf(c1),
            incoming = listOf(c1.copy(close = CandleValidatorAlgorithm.normalizeDecimal(BigDecimal("2744.00")))),
            timeframe = "M15",
            nowUtcMillis = nowMillis
        )
        assertEquals(1, merged.size)
        assertEquals("2744.00", PriceFormatterAlgorithm.formatPrice(merged.first().close, 2))
    }

    @Test
    fun passwordHashAlgorithm_verifiesPersonalOwnerPassword() {
        val salt = PasswordHashAlgorithm.generateSaltBase64()
        val hash = PasswordHashAlgorithm.hashPassword("MySecretPass123", salt)
        assertTrue(PasswordHashAlgorithm.verifyPassword("MySecretPass123", salt, hash))
        assertFalse(PasswordHashAlgorithm.verifyPassword("WrongPass", salt, hash))
    }
}
