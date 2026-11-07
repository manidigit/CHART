package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import es.manico.chartintelligence.R
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.components.LanguageThemeSelector
import es.manico.chartintelligence.ui.state.AuthScreenMode
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    isOwnerRegistered: Boolean,
    initialUsername: String,
    initialEmail: String = "",
    authMode: AuthScreenMode = AuthScreenMode.LOGIN,
    authErrorResId: Int? = null,
    authInfoResId: Int? = null,
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    onRegisterFirstOwner: (String, String, String, String) -> Unit,
    onSignInOwner: (String, String) -> Unit,
    onSetAuthMode: (AuthScreenMode) -> Unit = {},
    onRequestPasswordRecoveryCode: (String) -> Unit = {},
    onConfirmPasswordRecovery: (String, String, String, String) -> Unit = { _, _, _, _ -> },
    onGoogleIdTokenReceived: (String) -> Unit = {},
    onGoogleSignInFailed: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val financialPalette = LocalFinancialPalette.current

    var username by rememberSaveable(initialUsername) { mutableStateOf(initialUsername) }
    var email by rememberSaveable(initialEmail) { mutableStateOf(initialEmail) }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }
    var recoveryCode by rememberSaveable { mutableStateOf("") }
    var recoveryNewPassword by rememberSaveable { mutableStateOf("") }
    var recoveryConfirmPassword by rememberSaveable { mutableStateOf("") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 500.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.app_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "● ${stringResource(R.string.sync_server_badge)}",
                style = MaterialTheme.typography.labelSmall,
                color = financialPalette.bullCandle
            )

            Spacer(modifier = Modifier.height(14.dp))

            LanguageThemeSelector(
                currentLanguage = currentLanguage,
                isDarkTheme = isDarkTheme,
                onLanguageSelected = onLanguageSelected,
                onThemeSelected = onThemeSelected
            )

            Spacer(modifier = Modifier.height(14.dp))

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("login_card"),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, financialPalette.cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (authInfoResId != null) {
                        Text(
                            text = stringResource(authInfoResId),
                            style = MaterialTheme.typography.bodyMedium,
                            color = financialPalette.bullCandle,
                            modifier = Modifier.testTag("auth_info_text")
                        )
                    }

                    if (authErrorResId != null) {
                        Text(
                            text = stringResource(authErrorResId),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.testTag("auth_error_text")
                        )
                    }

                    when (authMode) {
                        AuthScreenMode.FORGOT_REQUEST -> {
                            Text(
                                text = stringResource(R.string.forgot_password_title),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.forgot_password_subtitle),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
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
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("recovery_email_input")
                                )
                            }

                            Button(
                                onClick = { onRequestPasswordRecoveryCode(email) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .testTag("send_recovery_code_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.action_send_recovery_code),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold
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
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(R.string.forgot_verify_subtitle),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
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
                                visualTransformation = PasswordVisualTransformation(),
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
                                visualTransformation = PasswordVisualTransformation(),
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
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 50.dp)
                                    .testTag("verify_recovery_code_button")
                            ) {
                                Text(
                                    text = stringResource(R.string.action_verify_and_reset),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.Bold
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
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(
                                    if (isOwnerRegistered) R.string.login_signin_subtitle else R.string.login_setup_subtitle
                                ),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
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
                                visualTransformation = PasswordVisualTransformation(),
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
                                    visualTransformation = PasswordVisualTransformation(),
                                    singleLine = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("confirm_password_input")
                                )
                            }

                            Spacer(modifier = Modifier.height(4.dp))

                            Button(
                                onClick = {
                                    if (isOwnerRegistered) {
                                        onSignInOwner(username, password)
                                    } else {
                                        onRegisterFirstOwner(username, password, confirmPassword, email)
                                    }
                                },
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
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    coroutineScope.launch {
                                        runCatching {
                                            val credentialManager = CredentialManager.create(context)
                                            val signInWithGoogleOption = GetSignInWithGoogleOption.Builder(
                                                serverClientId = context.getString(R.string.default_web_client_id)
                                            ).build()
                                            val request = GetCredentialRequest.Builder()
                                                .addCredentialOption(signInWithGoogleOption)
                                                .build()
                                            val result = credentialManager.getCredential(
                                                request = request,
                                                context = context
                                            )
                                            val cred = result.credential
                                            if (
                                                cred is CustomCredential &&
                                                cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                            ) {
                                                val googleIdTokenCredential =
                                                    GoogleIdTokenCredential.createFrom(cred.data)
                                                onGoogleIdTokenReceived(googleIdTokenCredential.idToken)
                                            } else {
                                                onGoogleSignInFailed()
                                            }
                                        }.onFailure {
                                            onGoogleSignInFailed()
                                        }
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .testTag("google_sign_in_button")
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.AccountCircle,
                                        contentDescription = stringResource(R.string.action_sign_in_google)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = stringResource(R.string.action_sign_in_google),
                                        style = MaterialTheme.typography.labelLarge
                                    )
                                }
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
                                        color = MaterialTheme.colorScheme.primary
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
