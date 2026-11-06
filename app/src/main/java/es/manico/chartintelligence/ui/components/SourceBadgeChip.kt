package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.data.model.ProviderId
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily

@Composable
fun SourceBadgeChip(
    provider: ProviderId,
    timeframe: String,
    modifier: Modifier = Modifier
) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier
                .background(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(6.dp)
                )
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.45f),
                    shape = RoundedCornerShape(6.dp)
                )
                .padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = provider.badgeLabel,
                style = MaterialTheme.typography.labelSmall,
                fontFamily = JetBrainsMonoFontFamily,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = "· $timeframe",
                style = MaterialTheme.typography.labelSmall,
                fontFamily = JetBrainsMonoFontFamily,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
