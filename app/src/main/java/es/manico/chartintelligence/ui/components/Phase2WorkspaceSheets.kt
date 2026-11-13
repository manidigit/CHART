package es.manico.chartintelligence.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.algorithms.GapReport
import es.manico.chartintelligence.algorithms.SeasonalsReport
import es.manico.chartintelligence.data.repository.SymbolIntelBundle
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import java.time.LocalDate
import java.util.Locale

private enum class BackupPendingAction { EXPORT, RESTORE }

/**
 * INF-01: Encrypted Workspace Backup & Restore Card using zero-permission Android SAF
 * (`CreateDocument` / `OpenDocument`) and user-provided passphrase (never persisted).
 */
@Composable
fun EncryptedBackupCard(
    language: AppLanguage,
    statusMessage: String?,
    onExportToUri: (Uri, String) -> Unit,
    onRestoreFromUri: (Uri, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val isFa = language == AppLanguage.FA
    var pendingUri by remember { mutableStateOf<Uri?>(null) }
    var pendingAction by remember { mutableStateOf<BackupPendingAction?>(null) }
    var passphrase by remember { mutableStateOf("") }
    var passphraseError by remember { mutableStateOf<String?>(null) }

    val exportLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri != null) {
            pendingUri = uri
            pendingAction = BackupPendingAction.EXPORT
            passphrase = ""
            passphraseError = null
        }
    }

    val restoreLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            pendingUri = uri
            pendingAction = BackupPendingAction.RESTORE
            passphrase = ""
            passphraseError = null
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("settings_encrypted_backup_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, financialPalette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Outlined.Lock,
                    contentDescription = if (isFa) "پشتیبان رمزنگاری‌شده" else "Encrypted Backup",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isFa) "پشتیبان رمزنگاری‌شده (AES-256-GCM)" else "Encrypted Backup & Restore (AES-256-GCM)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (isFa) {
                            "کلیدهای BYOK حذف می‌شوند؛ فایل با رمز عبور شما قفل می‌شود."
                        } else {
                            "BYOK API keys are stripped before sealing with PBKDF2 + AES-256-GCM."
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        val stamp = LocalDate.now().toString()
                        exportLauncher.launch("chart_intelligence_backup_${stamp}.cibak.json")
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("backup_export_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Download,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isFa) "خروجی پشتیبان" else "Export Backup",
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                OutlinedButton(
                    onClick = {
                        restoreLauncher.launch(arrayOf("application/json", "*/*"))
                    },
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, financialPalette.cardBorder),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("backup_restore_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.UploadFile,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isFa) "بازیابی فایل" else "Restore Backup",
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (!statusMessage.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = MaterialTheme.colorScheme.background,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("backup_status_banner")
                ) {
                    Text(
                        text = statusMessage,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                    )
                }
            }
        }
    }

    val activeUri = pendingUri
    val activeAction = pendingAction
    if (activeUri != null && activeAction != null) {
        val isExport = activeAction == BackupPendingAction.EXPORT
        AlertDialog(
            onDismissRequest = {
                pendingUri = null
                pendingAction = null
                passphrase = ""
                passphraseError = null
            },
            title = {
                Text(
                    text = if (isExport) {
                        if (isFa) "رمزگذاری فایل پشتیبان" else "Encrypt Backup File"
                    } else {
                        if (isFa) "رمزگشایی و بازیابی پشتیبان" else "Decrypt & Restore Backup"
                    }
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = if (isFa) {
                            "یک عبارت عبور حداقل ۸ کاراکتری وارد کنید (در دستگاه ذخیره نمی‌شود)."
                        } else {
                            "Enter a passphrase of at least 8 characters (never saved on device)."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = passphrase,
                        onValueChange = {
                            passphrase = it
                            passphraseError = null
                        },
                        label = {
                            Text(if (isFa) "عبارت عبور (حداقل ۸ کاراکتر)" else "Passphrase (min 8 chars)")
                        },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        isError = passphraseError != null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("backup_passphrase_input")
                    )
                    if (passphraseError != null) {
                        Text(
                            text = passphraseError!!,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (passphrase.length < 8) {
                            passphraseError = if (isFa) {
                                "رمز عبور باید حداقل ۸ کاراکتر باشد."
                            } else {
                                "Passphrase must be at least 8 characters."
                            }
                            return@Button
                        }
                        val uriCopy = activeUri
                        val passCopy = passphrase
                        pendingUri = null
                        pendingAction = null
                        passphrase = ""
                        passphraseError = null
                        if (isExport) {
                            onExportToUri(uriCopy, passCopy)
                        } else {
                            onRestoreFromUri(uriCopy, passCopy)
                        }
                    },
                    modifier = Modifier.testTag("backup_passphrase_confirm_button")
                ) {
                    Text(if (isFa) "تایید" else "Confirm")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        pendingUri = null
                        pendingAction = null
                        passphrase = ""
                        passphraseError = null
                    }
                ) {
                    Text(if (isFa) "انصراف" else "Cancel")
                }
            }
        )
    }
}

/**
 * ENG-03: Gap & Data Integrity Audit Row inside Settings Technical Diagnostics.
 */
@Composable
fun GapAuditSection(
    language: AppLanguage,
    activeGapReport: GapReport?,
    activeSymbolLabel: String?,
    onRunGapAudit: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val isFa = language == AppLanguage.FA
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag("settings_gap_audit_box"),
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.background,
        border = BorderStroke(1.dp, financialPalette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.FactCheck,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = if (isFa) "ممیزی یکپارچگی و شکاف کندل‌ها (ENG-03)" else "Gap & Integrity Audit (ENG-03)",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                OutlinedButton(
                    onClick = onRunGapAudit,
                    shape = RoundedCornerShape(6.dp),
                    border = BorderStroke(1.dp, financialPalette.cardBorder),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("settings_audit_gaps_button")
                ) {
                    Text(
                        text = if (isFa) "بررسی شکاف" else "Audit Gaps",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            if (activeGapReport != null) {
                val pctStr = String.format(Locale.US, "%.2f%%", activeGapReport.integrityRatio * 100.0)
                val statusColor = when (activeGapReport.status) {
                    "CLEAN" -> financialPalette.bullCandle
                    "MINOR_GAPS" -> financialPalette.warning
                    else -> financialPalette.bearCandle
                }
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        text = "${activeGapReport.symbolCode} · ${activeGapReport.timeframe} · ${activeGapReport.status} | Gaps: ${activeGapReport.gapCount} | Missing: ${activeGapReport.totalMissingBars} | Integrity: $pctStr (${activeGapReport.checkedBars} bars)",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = statusColor,
                        modifier = Modifier.testTag("settings_gap_audit_result")
                    )
                }
            } else {
                Text(
                    text = if (isFa) {
                        "برای بررسی شکاف‌های سشن کاری (${activeSymbolLabel ?: "نماد فعال"}) دکمه بررسی را بزنید."
                    } else {
                        "Tap Audit Gaps to inspect closed-bar session continuity for ${activeSymbolLabel ?: "active symbol"}."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * §2.3: SAF Candle Export (RFC 4180 CSV & Canonical JSON) with zero storage permissions.
 */
@Composable
fun CandleExportButtonsRow(
    symbolCode: String,
    timeframe: String,
    hasCandles: Boolean,
    onExportCsvToUri: (Uri) -> Unit,
    onExportJsonToUri: (Uri) -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val safeSym = symbolCode.uppercase().replace(Regex("[^A-Z0-9._-]"), "_")
    val safeTf = timeframe.uppercase().replace(Regex("[^A-Z0-9]"), "")

    val csvLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("text/csv")
    ) { uri ->
        if (uri != null) onExportCsvToUri(uri)
    }

    val jsonLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri != null) onExportJsonToUri(uri)
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { csvLauncher.launch("${safeSym}_${safeTf}.csv") },
                enabled = hasCandles,
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, financialPalette.cardBorder),
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("export_candles_csv_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.Download,
                    contentDescription = "Export CSV",
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Export CSV",
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = JetBrainsMonoFontFamily
                )
            }

            OutlinedButton(
                onClick = { jsonLauncher.launch("${safeSym}_${safeTf}.json") },
                enabled = hasCandles,
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, financialPalette.cardBorder),
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .testTag("export_candles_json_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.Download,
                    contentDescription = "Export JSON",
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Export JSON",
                    style = MaterialTheme.typography.labelMedium,
                    fontFamily = JetBrainsMonoFontFamily
                )
            }
        }
    }
}

/**
 * §2.3: Real Multi-Year Seasonals Heatmap Card (LOCAL_DERIVED from real D1 history >= 12 months).
 */
@Composable
fun MultiYearSeasonalsCard(
    language: AppLanguage,
    report: SeasonalsReport,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val isFa = language == AppLanguage.FA
    val monthNames = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("symbol_overview_seasonals_card"),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
        border = BorderStroke(1.dp, financialPalette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (isFa) "نقشه فصلی چندساله (D1)" else "Multi-Year Seasonals (D1)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f))
                ) {
                    Text(
                        text = "LOCAL_DERIVED",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            if (!report.hasSufficientData) {
                Text(
                    text = if (isFa) {
                        "داده تاریخی روزانه کافی برای جدول فصلی موجود نیست (${report.distinctMonthCount} / ۱۲ ماه متمایز D1)."
                    } else {
                        "Insufficient real D1 history for multi-year seasonals (${report.distinctMonthCount} / 12 distinct months loaded)."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Header row
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(modifier = Modifier.width(52.dp)) {
                                Text(
                                    text = "Year",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            for (m in monthNames) {
                                Box(modifier = Modifier.width(52.dp), contentAlignment = Alignment.Center) {
                                    Text(
                                        text = m,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)

                        for (year in report.yearsDesc.take(8)) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(modifier = Modifier.width(52.dp)) {
                                    Text(
                                        text = year.toString(),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                                for (monthIdx in 1..12) {
                                    val ret = report.cells[year to monthIdx]
                                    val cellBg = when {
                                        ret == null -> Color.Transparent
                                        ret >= 0.0 -> financialPalette.bullCandle.copy(alpha = 0.20f)
                                        else -> financialPalette.bearCandle.copy(alpha = 0.20f)
                                    }
                                    val cellFg = when {
                                        ret == null -> MaterialTheme.colorScheme.onSurfaceVariant
                                        ret >= 0.0 -> financialPalette.bullCandle
                                        else -> financialPalette.bearCandle
                                    }
                                    Box(
                                        modifier = Modifier
                                            .width(52.dp)
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(cellBg)
                                            .padding(vertical = 3.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = if (ret == null) "—" else String.format(Locale.US, "%+.1f%%", ret),
                                            style = MaterialTheme.typography.labelSmall,
                                            fontFamily = JetBrainsMonoFontFamily,
                                            color = cellFg,
                                            maxLines = 1
                                        )
                                    }
                                }
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = financialPalette.cardBorder)
                        // Avg % Row
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(modifier = Modifier.width(52.dp)) {
                                Text(
                                    text = "Avg%",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                            for (st in report.monthlyStats) {
                                Box(modifier = Modifier.width(52.dp), contentAlignment = Alignment.Center) {
                                    Text(
                                        text = if (st.sampleYears == 0) "—" else String.format(Locale.US, "%+.1f", st.avgReturnPct),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        color = if (st.avgReturnPct >= 0.0) financialPalette.bullCandle else financialPalette.bearCandle
                                    )
                                }
                            }
                        }
                        // Win % Row
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Box(modifier = Modifier.width(52.dp)) {
                                Text(
                                    text = "Win%",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            for (st in report.monthlyStats) {
                                Box(modifier = Modifier.width(52.dp), contentAlignment = Alignment.Center) {
                                    Text(
                                        text = if (st.sampleYears == 0) "—" else "${st.winRatePct.toInt()}%",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * §2.3: Live External Market Intel Card (Yahoo Finance RSS, EIA Energy RSS, SEC EDGAR Equities, Macro Schedule & Intermarket 60d Corr).
 */
@Composable
fun LiveSymbolIntelSection(
    language: AppLanguage,
    symbolCode: String,
    isStockSymbol: Boolean,
    intel: SymbolIntelBundle?,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val uriHandler = LocalUriHandler.current
    val isFa = language == AppLanguage.FA

    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag("live_symbol_intel_section"),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = financialPalette.bullCandle.copy(alpha = 0.16f),
                    border = BorderStroke(1.dp, financialPalette.bullCandle.copy(alpha = 0.45f))
                ) {
                    Text(
                        text = "EXTERNAL_LIVE",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = financialPalette.bullCandle,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
                if (intel != null && intel.fetchedAtUtc.isNotBlank()) {
                    Text(
                        text = intel.fetchedAtUtc.take(19).replace('T', ' '),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            OutlinedButton(
                onClick = onRefresh,
                enabled = !isLoading,
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, financialPalette.cardBorder),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("refresh_symbol_intel_button")
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        imageVector = Icons.Outlined.Refresh,
                        contentDescription = if (isFa) "بروزرسانی اخبار" else "Refresh Intel",
                        modifier = Modifier.size(16.dp)
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = if (isFa) "بروزرسانی" else "Refresh",
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }

        if (intel == null && isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 20.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
            return@Column
        }

        // 1. Live News RSS
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
            border = BorderStroke(1.dp, financialPalette.cardBorder)
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = if (isFa) "اخبار زنده بازار ($symbolCode)" else "Live News Feed ($symbolCode)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                val newsList = intel?.news.orEmpty()
                if (newsList.isEmpty()) {
                    Text(
                        text = if (isFa) "خبر زنده‌ای برای این نماد دریافت نشد." else "No live external news items returned.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    for (item in newsList.take(8)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .clickable {
                                    if (item.url.startsWith("http")) {
                                        runCatching { uriHandler.openUri(item.url) }
                                    }
                                }
                                .padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${item.publisher} · ${item.publishedUtc.take(16).replace('T', ' ')}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            if (item.url.startsWith("http")) {
                                Icon(
                                    imageVector = Icons.Outlined.OpenInNew,
                                    contentDescription = "Open article",
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                        HorizontalDivider(thickness = 0.5.dp, color = financialPalette.cardBorder)
                    }
                }
            }
        }

        // 2. SEC EDGAR Filings (Strictly US Equities)
        if (isStockSymbol) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "SEC EDGAR Filings ($symbolCode)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    val filings = intel?.secFilings.orEmpty()
                    if (filings.isEmpty()) {
                        Text(
                            text = intel?.secNotice ?: "No recent SEC filings available.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        for (f in filings.take(6)) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable {
                                        if (f.url.startsWith("http")) {
                                            runCatching { uriHandler.openUri(f.url) }
                                        }
                                    }
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${f.form} · ${f.filingDate}",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = f.description.ifBlank { f.form },
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(horizontal = 8.dp),
                                    textAlign = TextAlign.End
                                )
                                if (f.url.startsWith("http")) {
                                    Icon(
                                        imageVector = Icons.Outlined.OpenInNew,
                                        contentDescription = "Open SEC Filing",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Macro Release Schedule
        val macros = intel?.macroEvents.orEmpty()
        if (macros.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = if (isFa) "تقویم رسمی داده‌های کلان" else "Official Macro Release Schedule",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    for (ev in macros.take(6)) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${ev.code} · ${ev.title}",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Text(
                                        text = ev.scheduledUtc,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Text(
                                    text = ev.relevance,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = if (ev.relevance == "HIGH") financialPalette.warning else MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                    }
                }
            }
        }

        // 4. Intermarket Benchmarks & 60d Rolling Correlation
        val imList = intel?.intermarket.orEmpty()
        if (imList.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = if (isFa) "شاخص‌های بین‌بازاری و همبستگی ۶۰ روزه" else "Intermarket Benchmarks & 60d Correlation",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    for (row in imList) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            val chgColor = if (row.changePct >= 0.0) financialPalette.bullCandle else financialPalette.bearCandle
                            val corrText = row.corr60d?.let { String.format(Locale.US, "r=%.2f", it) } ?: "r=—"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${row.ticker} (${row.label})",
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = String.format(Locale.US, "%.2f (%+.2f%%) · %s", row.lastPrice, row.changePct, corrText),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = chgColor
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
