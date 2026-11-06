package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.ChartTabState
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@Composable
fun ChartTabBar(
    tabs: List<ChartTabState>,
    activeTabId: String?,
    onSelectTab: (String) -> Unit,
    onCloseTab: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val scrollState = rememberScrollState()

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .horizontalScroll(scrollState)
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            for (tab in tabs) {
                val isSelected = tab.tabId == activeTabId
                val bgColor = if (isSelected) {
                    MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
                } else {
                    MaterialTheme.colorScheme.surface
                }
                val borderColor = if (isSelected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    financialPalette.cardBorder
                }

                Row(
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(bgColor)
                        .border(1.dp, borderColor, RoundedCornerShape(10.dp))
                        .clickable { onSelectTab(tab.tabId) }
                        .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)
                        .testTag("chart_tab_${tab.tabId.lowercase()}"),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = tab.symbolCode,
                        style = MaterialTheme.typography.labelLarge,
                        fontFamily = JetBrainsMonoFontFamily,
                        fontWeight = FontWeight.Bold,
                        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "${tab.provider.badgeLabel} (${tab.timeframe})",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    IconButton(
                        onClick = { onCloseTab(tab.tabId) },
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("close_tab_${tab.tabId.lowercase()}")
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = stringResource(R.string.chart_close_tab),
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
