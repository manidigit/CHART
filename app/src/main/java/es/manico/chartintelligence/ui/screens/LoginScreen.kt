package es.manico.chartintelligence.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.i18n.AppLanguage
import es.manico.chartintelligence.ui.components.LanguageThemeSelector
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

@Composable
fun LoginScreen(
    isOwnerRegistered: Boolean,
    initialUsername: String,
    authErrorResId: Int?,
    currentLanguage: AppLanguage,
    isDarkTheme: Boolean,
    onLanguageSelected: (AppLanguage) -> Unit,
    onThemeSelected: (Boolean) -> Unit,
    onRegisterFirstOwner: (String, String, String) -> Unit,
    onSignInOwner: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val financialPalette = LocalFinancialPalette.current
    var username by rememberSaveable(initialUsername) { mutableStateOf(initialUsername) }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }

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

            Spacer(modifier = Modifier.height(16.dp))

            LanguageThemeSelector(
                currentLanguage = currentLanguage,
                isDarkTheme = isDarkTheme,
                onLanguageSelected = onLanguageSelected,
                onThemeSelected = onThemeSelected
            )

            Spacer(modifier = Modifier.height(16.dp))

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

                    if (authErrorResId != null) {
                        Text(
                            text = stringResource(authErrorResId),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.testTag("auth_error_text")
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    Button(
                        onClick = {
                            if (isOwnerRegistered) {
                                onSignInOwner(username, password)
                            } else {
                                onRegisterFirstOwner(username, password, confirmPassword)
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
                }
            }
        }
    }
}
