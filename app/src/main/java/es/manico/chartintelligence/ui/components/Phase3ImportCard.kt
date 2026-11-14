package es.manico.chartintelligence.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.model.SymbolConfig
import es.manico.chartintelligence.data.repository.ImportBatchDto
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

/**
 * Phase 3: Historical Data Import (CSV / EIA RBRTEd.xls / JSON) & Manual OHLC Entry Card.
 * Uses zero-permission Android SAF (OpenDocument) and strictly enforces the No-Image-Storage Policy.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Phase3ImportCard(
    language: AppLanguage,
    symbols: List<SymbolConfig>,
    importBatches: List<ImportBatchDto>,
    statusMessage: String?,
    onImportDocumentUri: (Uri, String, String, String, String) -> Unit,
    onSubmitManualOhlc: (String, String, String, String, String, Double, Double, Double, Double, Double) -> Unit,
    onRefreshBatches: () -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    val isFa = language == AppLanguage.FA

    var selectedSymbol by rememberSaveable { mutableStateOf(symbols.firstOrNull()?.symbolCode ?: "SPOTBRENT") }
    var selectedProvider by rememberSaveable { mutableStateOf("local_csv") }
    var selectedTimeframe by rememberSaveable { mutableStateOf("D1") }
    var selectedQuality by rememberSaveable { mutableStateOf("OFFICIAL") }
    var showSymbolMenu by remember { mutableStateOf(false) }
    var showProviderMenu by remember { mutableStateOf(false) }
    var showManualDialog by rememberSaveable { mutableStateOf(false) }

    val openDocLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            onImportDocumentUri(uri, selectedSymbol, selectedProvider, selectedTimeframe, selectedQuality)
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("settings_phase3_import_card"),
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
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.settings_import_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(R.string.settings_import_subtitle),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(
                    onClick = onRefreshBatches,
                    modifier = Modifier
                        .size(48.dp)
                        .testTag("import_refresh_batches_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Refresh,
                        contentDescription = if (isFa) "بروزرسانی دسته‌های ورود" else "Refresh import batches",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (!statusMessage.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = statusMessage,
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = JetBrainsMonoFontFamily,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    OutlinedButton(
                        onClick = { showSymbolMenu = true },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("import_symbol_selector")
                    ) {
                        Text(
                            text = selectedSymbol,
                            fontFamily = JetBrainsMonoFontFamily,
                            maxLines = 1
                        )
                    }
                    DropdownMenu(
                        expanded = showSymbolMenu,
                        onDismissRequest = { showSymbolMenu = false }
                    ) {
                        symbols.forEach { sym ->
                            DropdownMenuItem(
                                text = { Text(sym.symbolCode, fontFamily = JetBrainsMonoFontFamily) },
                                onClick = {
                                    selectedSymbol = sym.symbolCode
                                    showSymbolMenu = false
                                }
                            )
                        }
                    }
                }

                Box(modifier = Modifier.weight(1f)) {
                    OutlinedButton(
                        onClick = { showProviderMenu = true },
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .testTag("import_provider_selector")
                    ) {
                        Text(
                            text = selectedProvider,
                            fontFamily = JetBrainsMonoFontFamily,
                            maxLines = 1
                        )
                    }
                    DropdownMenu(
                        expanded = showProviderMenu,
                        onDismissRequest = { showProviderMenu = false }
                    ) {
                        listOf("local_csv", "eia_brent_spot", "stooq", "tvdatafeed").forEach { provId ->
                            DropdownMenuItem(
                                text = { Text(provId, fontFamily = JetBrainsMonoFontFamily) },
                                onClick = {
                                    selectedProvider = provId
                                    showProviderMenu = false
                                }
                            )
                        }
                    }
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("D1", "M15", "H1", "H4", "W1").forEach { tf ->
                    FilterChip(
                        selected = selectedTimeframe == tf,
                        onClick = { selectedTimeframe = tf },
                        label = { Text(tf, fontFamily = JetBrainsMonoFontFamily) },
                        modifier = Modifier.heightIn(min = 48.dp)
                    )
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("OFFICIAL", "VERIFIED", "CORRECTED").forEach { q ->
                    FilterChip(
                        selected = selectedQuality == q,
                        onClick = { selectedQuality = q },
                        label = { Text(q, fontFamily = JetBrainsMonoFontFamily) },
                        modifier = Modifier.heightIn(min = 48.dp)
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        openDocLauncher.launch(
                            arrayOf(
                                "text/csv",
                                "text/comma-separated-values",
                                "text/plain",
                                "application/vnd.ms-excel",
                                "application/json",
                                "*/*"
                            )
                        )
                    },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("import_pick_file_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.UploadFile,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.settings_import_upload_btn),
                        maxLines = 1
                    )
                }

                OutlinedButton(
                    onClick = { showManualDialog = true },
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, financialPalette.cardBorder),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("import_manual_ohlc_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.EditNote,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.settings_manual_ohlc_btn),
                        maxLines = 1
                    )
                }
            }

            if (importBatches.isEmpty()) {
                Text(
                    text = stringResource(R.string.import_batches_empty),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    importBatches.take(6).forEach { b ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.background, RoundedCornerShape(6.dp))
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "${b.symbolCode} · ${b.providerId} · ${b.timeframe} (${b.sourceType})",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${b.fileName} · ${b.importedAtUtc}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = JetBrainsMonoFontFamily,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                text = "+${b.rowsInserted} / ~${b.rowsCorrected}",
                                style = MaterialTheme.typography.labelSmall,
                                fontFamily = JetBrainsMonoFontFamily,
                                fontWeight = FontWeight.Bold,
                                color = financialPalette.bullCandle
                            )
                        }
                    }
                }
            }
        }
    }

    if (showManualDialog) {
        var dtText by remember { mutableStateOf("2026-11-13") }
        var oText by remember { mutableStateOf("") }
        var hText by remember { mutableStateOf("") }
        var lText by remember { mutableStateOf("") }
        var cText by remember { mutableStateOf("") }
        var vText by remember { mutableStateOf("0") }
        var validationError by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { showManualDialog = false },
            title = {
                Text(
                    text = stringResource(R.string.settings_manual_ohlc_title),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = dtText,
                        onValueChange = { dtText = it },
                        label = { Text("UTC Date / Time (YYYY-MM-DD or HH:mm)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = oText,
                            onValueChange = { oText = it },
                            label = { Text("Open") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = cText,
                            onValueChange = { cText = it },
                            label = { Text("Close") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = hText,
                            onValueChange = { hText = it },
                            label = { Text("High") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = lText,
                            onValueChange = { lText = it },
                            label = { Text("Low") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                    }
                    OutlinedTextField(
                        value = vText,
                        onValueChange = { vText = it },
                        label = { Text("Volume") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (!validationError.isNullOrBlank()) {
                        Text(
                            text = validationError.orEmpty(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val c = cText.toDoubleOrNull()
                        val o = oText.toDoubleOrNull() ?: c
                        val h = hText.toDoubleOrNull() ?: if (o != null && c != null) maxOf(o, c) else null
                        val l = lText.toDoubleOrNull() ?: if (o != null && c != null) minOf(o, c) else null
                        val v = (vText.toDoubleOrNull() ?: 0.0).coerceAtLeast(0.0)
                        if (dtText.isBlank() || c == null || o == null || h == null || l == null || c <= 0.0) {
                            validationError = if (isFa) "مقادیر OHLC یا زمان معتبر نیست." else "Invalid OHLC or UTC timestamp."
                        } else {
                            showManualDialog = false
                            onSubmitManualOhlc(
                                selectedSymbol,
                                selectedProvider,
                                selectedTimeframe,
                                selectedQuality,
                                dtText.trim(),
                                o,
                                h,
                                l,
                                c,
                                v
                            )
                        }
                    },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.settings_manual_ohlc_btn))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showManualDialog = false },
                    modifier = Modifier.heightIn(min = 48.dp)
                ) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}
