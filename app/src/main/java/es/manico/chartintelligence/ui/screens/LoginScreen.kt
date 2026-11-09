package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.state.AuthScreenMode
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@Composable
fun LoginScreen(
    isOwnerRegistered: Boolean,
    initialUsername: String,
    initialEmail: String = "",
    initialPassword: String = "",
    rememberCredentials: Boolean = true,
    authMode: AuthScreenMode = AuthScreenMode.LOGIN,
    authErrorResId: Int? = null,
    authInfoResId: Int? = null,
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    onRememberCredentialsChanged: (Boolean) -> Unit = {},
    onRegisterFirstOwner: (String, String, String, String) -> Unit,
    onSignInOwner: (String, String) -> Unit,
    onSetAuthMode: (AuthScreenMode) -> Unit = {},
    onRequestPasswordRecoveryCode: (String) -> Unit = {},
    onConfirmPasswordRecovery: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current

    var username by rememberSaveable(initialUsername) { mutableStateOf(initialUsername) }
    var email by rememberSaveable(initialEmail) { mutableStateOf(initialEmail) }
    var password by rememberSaveable(initialPassword) { mutableStateOf(initialPassword) }
    var confirmPassword by rememberSaveable { mutableStateOf("") }
    var recoveryCode by rememberSaveable { mutableStateOf("") }
    var recoveryNewPassword by rememberSaveable { mutableStateOf("") }
    var recoveryConfirmPassword by rememberSaveable { mutableStateOf("") }
    var showPassword by rememberSaveable { mutableStateOf(false) }

    val pwVisualTransformation = if (showPassword) {
        VisualTransformation.None
    } else {
        PasswordVisualTransformation()
    }

    val terminalBg = if (isDarkTheme) Color(0xFF0B0E14) else Color(0xFFF0F3FA)
    val cardBg = if (isDarkTheme) Color(0xFF131722) else Color(0xFFFFFFFF)
    val pillBg = if (isDarkTheme) Color(0xFF1E222D) else Color(0xFFFFFFFF)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(terminalBg)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Floating Terminal Bar: Brand on Left + Compact Language/Theme Pill on Right
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 460.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(RoundedCornerShape(7.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(Color(0xFF2962FF), Color(0xFF1E40AF))
                                    )
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "CI",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                        Text(
                            text = "CHART INTELLIGENCE",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onBackground,
                            letterSpacing = 0.6.sp
                        )
                    }

                    // Compact TradingView-style Pill for Language (FA | EN) & Theme (Dark / Light)
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = pillBg,
                        border = BorderStroke(1.dp, financialPalette.cardBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            val isFa = currentLanguage == AppLanguage.FA
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(
                                        if (isFa) MaterialTheme.colorScheme.primary else Color.Transparent
                                    )
                                    .clickable { onLanguageSelected(AppLanguage.FA) }
                                    .padding(horizontal = 10.dp, vertical = 5.dp)
                                    .testTag("lang_fa_button"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "FA",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isFa) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(
                                        if (!isFa) MaterialTheme.colorScheme.primary else Color.Transparent
                                    )
                                    .clickable { onLanguageSelected(AppLanguage.EN) }
                                    .padding(horizontal = 10.dp, vertical = 5.dp)
                                    .testTag("lang_en_button"),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "EN",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (!isFa) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .width(1.dp)
                                    .height(16.dp)
                                    .background(financialPalette.cardBorder)
                            )

                            Box(
                                modifier = Modifier
                                    .size(28.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                                    .clickable { onThemeSelected(!isDarkTheme) }
                                    .testTag("theme_toggle_button"),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (isDarkTheme) Icons.Outlined.DarkMode else Icons.Outlined.LightMode,
                                    contentDescription = stringResource(
                                        if (isDarkTheme) R.string.settings_theme_dark else R.string.settings_theme_light
                                    ),
                                    tint = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // Center TradingView Pro Auth Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 430.dp)
                    .testTag("login_card"),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, financialPalette.cardBorder),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 22.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Brand Emblem + Server Sync Badge
                    Box(
                        modifier = Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                Brush.linearGradient(
                                    listOf(Color(0xFF2962FF), Color(0xFF1E40AF))
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "CI",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            fontFamily = FontFamily.Monospace
                        )
                    }

                    Text(
                        text = stringResource(R.string.app_name),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    Text(
                        text = stringResource(R.string.app_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )

                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = financialPalette.bullCandle.copy(alpha = 0.12f),
                        border = BorderStroke(1.dp, financialPalette.bullCandle.copy(alpha = 0.35f))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(financialPalette.bullCandle)
                            )
                            Text(
                                text = stringResource(R.string.sync_server_badge),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = financialPalette.bullCandle
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    if (authInfoResId != null) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = financialPalette.bullCandle.copy(alpha = 0.14f),
                            border = BorderStroke(1.dp, financialPalette.bullCandle)
                        ) {
                            Text(
                                text = stringResource(authInfoResId),
                                style = MaterialTheme.typography.bodySmall,
                                color = financialPalette.bullCandle,
                                modifier = Modifier
                                    .padding(10.dp)
                                    .testTag("auth_info_text")
                            )
                        }
                    }

                    if (authErrorResId != null) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error)
                        ) {
                            Text(
                                text = stringResource(authErrorResId),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier
                                    .padding(10.dp)
                                    .testTag("auth_error_text")
                            )
                        }
                    }

                    when (authMode) {
                        AuthScreenMode.FORGOT_REQUEST -> {
                            Text(
                                text = stringResource(R.string.forgot_password_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.forgot_password_subtitle),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )

                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                OutlinedTextField(
                                    value = email,
                                    onValueChange = { email = it },
                                    label = { Text(stringResource(R.string.label_recovery_email)) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Outlined.Email,
                                            contentDescription = stringResource(R.string.label_recovery_email)
                                        )
                                    },
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Email,
                                        imeAction = ImeAction.Done
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("recovery_email_input")
                                )
                            }

                            Button(
                                onClick = { onRequestPasswordRecoveryCode(email) },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2962FF)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .testTag("send_recovery_code_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.action_send_recovery_code),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }

                            TextButton(
                                onClick = { onSetAuthMode(AuthScreenMode.LOGIN) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("back_to_login_button")
                            ) {
                                Text(text = stringResource(R.string.action_back_to_login))
                            }
                        }

                        AuthScreenMode.FORGOT_VERIFY -> {
                            Text(
                                text = stringResource(R.string.forgot_password_title),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.forgot_verify_subtitle),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )

                            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                OutlinedTextField(
                                    value = email,
                                    onValueChange = { email = it },
                                    label = { Text(stringResource(R.string.label_recovery_email)) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Outlined.Email,
                                            contentDescription = stringResource(R.string.label_recovery_email)
                                        )
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("recovery_verify_email_input")
                                )

                                OutlinedTextField(
                                    value = recoveryCode,
                                    onValueChange = { recoveryCode = it.filter { ch -> ch.isDigit() }.take(6) },
                                    label = { Text(stringResource(R.string.label_recovery_code)) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Outlined.Key,
                                            contentDescription = stringResource(R.string.label_recovery_code)
                                        )
                                    },
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Number,
                                        imeAction = ImeAction.Next
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("recovery_code_input")
                                )
                            }

                            OutlinedTextField(
                                value = recoveryNewPassword,
                                onValueChange = { recoveryNewPassword = it },
                                label = { Text(stringResource(R.string.settings_new_password)) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Outlined.Lock,
                                        contentDescription = stringResource(R.string.settings_new_password)
                                    )
                                },
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                            contentDescription = stringResource(
                                                if (showPassword) R.string.login_hide_password else R.string.login_show_password
                                            )
                                        )
                                    }
                                },
                                visualTransformation = pwVisualTransformation,
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("recovery_new_password_input")
                            )

                            OutlinedTextField(
                                value = recoveryConfirmPassword,
                                onValueChange = { recoveryConfirmPassword = it },
                                label = { Text(stringResource(R.string.label_confirm_password)) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Outlined.Lock,
                                        contentDescription = stringResource(R.string.label_confirm_password)
                                    )
                                },
                                visualTransformation = pwVisualTransformation,
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("recovery_confirm_password_input")
                            )

                            Button(
                                onClick = {
                                    onConfirmPasswordRecovery(
                                        email,
                                        recoveryCode,
                                        recoveryNewPassword,
                                        recoveryConfirmPassword
                                    )
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2962FF)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .testTag("verify_recovery_code_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.action_verify_and_reset),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }

                            TextButton(
                                onClick = { onSetAuthMode(AuthScreenMode.LOGIN) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("back_to_login_from_verify_button")
                            ) {
                                Text(text = stringResource(R.string.action_back_to_login))
                            }
                        }

                        AuthScreenMode.LOGIN -> {
                            Text(
                                text = stringResource(
                                    if (isOwnerRegistered) R.string.login_signin_title else R.string.login_setup_title
                                ),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(
                                    if (isOwnerRegistered) R.string.login_signin_subtitle else R.string.login_setup_subtitle
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )

                            OutlinedTextField(
                                value = username,
                                onValueChange = { username = it },
                                label = { Text(stringResource(R.string.label_username)) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Outlined.Person,
                                        contentDescription = stringResource(R.string.label_username)
                                    )
                                },
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("username_input")
                            )

                            if (!isOwnerRegistered) {
                                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                                    OutlinedTextField(
                                        value = email,
                                        onValueChange = { email = it },
                                        label = { Text(stringResource(R.string.label_email)) },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Outlined.Email,
                                                contentDescription = stringResource(R.string.label_email)
                                            )
                                        },
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = KeyboardType.Email,
                                            imeAction = ImeAction.Next
                                        ),
                                        shape = RoundedCornerShape(10.dp),
                                        singleLine = true,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("email_input")
                                    )
                                }
                            }

                            OutlinedTextField(
                                value = password,
                                onValueChange = { password = it },
                                label = { Text(stringResource(R.string.label_password)) },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Outlined.Lock,
                                        contentDescription = stringResource(R.string.label_password)
                                    )
                                },
                                trailingIcon = {
                                    IconButton(
                                        onClick = { showPassword = !showPassword },
                                        modifier = Modifier.testTag("toggle_password_visibility_button")
                                    ) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                            contentDescription = stringResource(
                                                if (showPassword) R.string.login_hide_password else R.string.login_show_password
                                            )
                                        )
                                    }
                                },
                                visualTransformation = pwVisualTransformation,
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = if (isOwnerRegistered) ImeAction.Done else ImeAction.Next
                                ),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("password_input")
                            )

                            if (!isOwnerRegistered) {
                                OutlinedTextField(
                                    value = confirmPassword,
                                    onValueChange = { confirmPassword = it },
                                    label = { Text(stringResource(R.string.label_confirm_password)) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Outlined.Lock,
                                            contentDescription = stringResource(R.string.label_confirm_password)
                                        )
                                    },
                                    visualTransformation = pwVisualTransformation,
                                    keyboardOptions = KeyboardOptions(
                                        keyboardType = KeyboardType.Password,
                                        imeAction = ImeAction.Done
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("confirm_password_input")
                                )
                            }

                            // Save Password & Keep Me Signed In Toggle Row
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { onRememberCredentialsChanged(!rememberCredentials) }
                                    .padding(vertical = 2.dp)
                                    .testTag("remember_credentials_row"),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Start
                            ) {
                                Checkbox(
                                    checked = rememberCredentials,
                                    onCheckedChange = { onRememberCredentialsChanged(it) },
                                    colors = CheckboxDefaults.colors(
                                        checkedColor = Color(0xFF2962FF),
                                        checkmarkColor = Color.White
                                    ),
                                    modifier = Modifier.testTag("remember_credentials_checkbox")
                                )
                                Text(
                                    text = stringResource(R.string.login_remember_credentials),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Button(
                                onClick = {
                                    if (isOwnerRegistered) {
                                        onSignInOwner(username, password)
                                    } else {
                                        onRegisterFirstOwner(username, password, confirmPassword, email)
                                    }
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2962FF)),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .testTag("login_submit_button")
                            ) {
                                Text(
                                    text = stringResource(
                                        if (isOwnerRegistered) R.string.action_sign_in else R.string.action_create_owner_account
                                    ),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }

                            if (isOwnerRegistered) {
                                TextButton(
                                    onClick = { onSetAuthMode(AuthScreenMode.FORGOT_REQUEST) },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(min = 48.dp)
                                        .testTag("forgot_password_button")
                                ) {
                                    Text(
                                        text = stringResource(R.string.action_forgot_password),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}
