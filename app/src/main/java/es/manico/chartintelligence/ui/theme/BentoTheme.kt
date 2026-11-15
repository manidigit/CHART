package es.manico.chartintelligence.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// ==========================================
// Bento Grid Standard Shapes
// ==========================================
val BentoHeroShape = RoundedCornerShape(22.dp)
val BentoCardShape = RoundedCornerShape(18.dp)
val BentoSubCellShape = RoundedCornerShape(14.dp)
val BentoPillShape = RoundedCornerShape(12.dp)
val BentoBadgeShape = RoundedCornerShape(8.dp)

// ==========================================
// Bento Glassmorphism & Gradient Brushes
// ==========================================
@Composable
fun bentoCardBrush(isDark: Boolean): Brush {
    return if (isDark) {
        Brush.linearGradient(
            colors = listOf(
                Color(0xFF222634).copy(alpha = 0.92f),
                Color(0xFF1A1D27).copy(alpha = 0.98f)
            )
        )
    } else {
        Brush.linearGradient(
            colors = listOf(
                Color(0xFFFFFFFF),
                Color(0xFFF8FAFC)
            )
        )
    }
}

@Composable
fun bentoBorderBrush(isDark: Boolean, isAccented: Boolean = false): Brush {
    return if (isAccented) {
        Brush.linearGradient(
            colors = listOf(
                MaterialTheme.colorScheme.primary.copy(alpha = 0.70f),
                MaterialTheme.colorScheme.secondary.copy(alpha = 0.35f)
            )
        )
    } else if (isDark) {
        Brush.linearGradient(
            colors = listOf(
                Color(0xFF384054).copy(alpha = 0.45f),
                Color(0xFF202430).copy(alpha = 0.25f)
            )
        )
    } else {
        Brush.linearGradient(
            colors = listOf(
                Color(0xFFE2E8F0),
                Color(0xFFCBD5E1)
            )
        )
    }
}

@Composable
fun bentoHeroBrush(isDark: Boolean): Brush {
    val primary = MaterialTheme.colorScheme.primary
    val secondary = MaterialTheme.colorScheme.secondary
    return if (isDark) {
        Brush.radialGradient(
            colors = listOf(
                primary.copy(alpha = 0.18f),
                secondary.copy(alpha = 0.08f),
                Color(0xFF171A24).copy(alpha = 0.95f)
            ),
            radius = 650f
        )
    } else {
        Brush.radialGradient(
            colors = listOf(
                primary.copy(alpha = 0.12f),
                secondary.copy(alpha = 0.05f),
                Color(0xFFFFFFFF)
            ),
            radius = 650f
        )
    }
}

// ==========================================
// Micro-Interaction: Spring Scale & Haptic Touch Modifier
// ==========================================
@Composable
fun Modifier.bentoInteractive(
    enabled: Boolean = true,
    hapticType: HapticFeedbackType = HapticFeedbackType.TextHandleMove,
    onClick: (() -> Unit)? = null
): Modifier {
    if (!enabled && onClick == null) return this

    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.972f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "bento_spring_scale"
    )

    val alpha by animateFloatAsState(
        targetValue = if (isPressed) 0.90f else 1.0f,
        animationSpec = spring(stiffness = Spring.StiffnessHigh),
        label = "bento_spring_alpha"
    )

    val clickableMod = if (onClick != null) {
        Modifier
            .minimumInteractiveComponentSize()
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = {
                    haptic.performHapticFeedback(hapticType)
                    onClick()
                }
            )
    } else Modifier

    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
            this.alpha = alpha
        }
        .then(clickableMod)
}

// ==========================================
// Reusable Bento Card Components
// ==========================================
@Composable
fun BentoCard(
    modifier: Modifier = Modifier,
    shape: Shape = BentoCardShape,
    isAccented: Boolean = false,
    contentPadding: Dp = 16.dp,
    onClick: (() -> Unit)? = null,
    testTag: String? = null,
    content: @Composable BoxScope.() -> Unit
) {
    val isDark = MaterialTheme.colorScheme.background.red < 0.5f
    val bgBrush = bentoCardBrush(isDark)
    val borderBrush = bentoBorderBrush(isDark, isAccented)

    val baseMod = modifier
        .clip(shape)
        .background(bgBrush)
        .border(width = if (isAccented) 1.5.dp else 1.dp, brush = borderBrush, shape = shape)
        .bentoInteractive(onClick = onClick)
        .padding(contentPadding)

    val tagMod = if (testTag != null) baseMod.testTag(testTag) else baseMod

    Box(modifier = tagMod, content = content)
}

@Composable
fun BentoHeroCard(
    modifier: Modifier = Modifier,
    isDark: Boolean = MaterialTheme.colorScheme.background.red < 0.5f,
    testTag: String? = null,
    onClick: (() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit
) {
    val heroBrush = bentoHeroBrush(isDark)
    val borderBrush = bentoBorderBrush(isDark, isAccented = true)

    val baseMod = modifier
        .fillMaxWidth()
        .clip(BentoHeroShape)
        .background(heroBrush)
        .border(width = 1.5.dp, brush = borderBrush, shape = BentoHeroShape)
        .bentoInteractive(onClick = onClick)
        .padding(18.dp)

    val tagMod = if (testTag != null) baseMod.testTag(testTag) else baseMod

    Box(modifier = tagMod, content = content)
}

@Composable
fun BentoStatCell(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    accentColor: Color = MaterialTheme.colorScheme.primary,
    icon: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    testTag: String? = null
) {
    val isDark = MaterialTheme.colorScheme.background.red < 0.5f
    BentoCard(
        modifier = modifier,
        shape = BentoSubCellShape,
        contentPadding = 12.dp,
        onClick = onClick,
        testTag = testTag
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
                if (icon != null) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(accentColor.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        icon()
                    }
                }
            }
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontFamily = JetBrainsMonoFontFamily,
                fontWeight = FontWeight.Bold,
                color = accentColor,
                maxLines = 1
            )
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    maxLines = 1
                )
            }
        }
    }
}
